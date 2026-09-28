import type { Asset, Book, Person, Project, Reference, Section } from "@/db/schema";
import { plainText } from "@/lib/doc";
import { escapeText, escapeUrl } from "./escape";
import { collectRefKinds, serializeDoc, type SerializeContext } from "./serialize";

/**
 * Assembles complete LaTeX sources (as a map of path -> file content) for
 * one project report or for the merged book. The layout mirrors the
 * original SQLyst project: cover, profile, front matter, contents, body,
 * references, appendices.
 */

export interface ProjectData {
  project: Project;
  people: Person[];
  sections: Section[];
  references: Reference[];
}

export interface BookData {
  book: Book;
  preface: Section | null;
  projects: ProjectData[];
}

export interface RenderResult {
  files: Record<string, string>;
  /** Assets to download into the build folder: storage key -> path. */
  assets: { asset: Asset; path: string }[];
  warnings: string[];
}

class Renderer {
  files: Record<string, string> = {};
  assetsUsed = new Map<string, { asset: Asset; path: string }>();
  warnings: string[] = [];
  constructor(private assets: Map<string, Asset>) {}

  assetPath(assetId: string | null | undefined, dir: string): string | null {
    if (!assetId) return null;
    const asset = this.assets.get(assetId);
    if (!asset) return null;
    const path = `${dir}/${asset.id}.${asset.ext}`;
    this.assetsUsed.set(asset.id, { asset, path });
    return path;
  }

  text(s: string, where: string) {
    return escapeText(s, {
      onUnsupported: (ch) => this.warnings.push(`${where}: character "${ch}" cannot be printed`),
    });
  }

  result(): RenderResult {
    return { files: this.files, assets: [...this.assetsUsed.values()], warnings: this.warnings };
  }
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "section"
  );
}

const PREAMBLE = `\\documentclass[a4paper,10pt,twoside]{article}

\\input{config/packages}
\\input{config/style}
\\input{config/listings}
\\input{config/commands}
`;

// ---------------------------------------------------------------------------
// Cover and profile pages

function coverTex(r: Renderer, p: Project, book: Book, dir: string): string {
  const where = `${p.name} cover`;
  const instLogo = r.assetPath(book.institutionLogoAssetId, "book/assets");
  const logo = r.assetPath(p.logoAssetId, `${dir}/assets`);
  const title = r.text(p.name, where) + (p.tagline ? `:\\\\[-1mm]\n      ${r.text(p.tagline, where)}` : "");
  return `% Cover page of ${p.name} (generated from the project settings)
\\thispagestyle{empty}
\\begin{tikzpicture}[remember picture,overlay]
  % left vertical bar
  \\fill[CoverNavy] (current page.north west) rectangle ([xshift=10mm]current page.south west);
${
  instLogo
    ? `  % institution logo
  \\node[anchor=north west,inner sep=0] at ([xshift=28mm,yshift=-25mm]current page.north west)
    {\\includegraphics[width=60mm]{${instLogo}}};\n`
    : ""
}  % report type
  \\node[anchor=north west,inner sep=0,text=CoverGray,font=\\rmfamily\\bfseries\\fontsize{14}{16}\\selectfont]
    at ([xshift=28mm,yshift=-57mm]current page.north west) {${r.text(p.reportType, where)}};
  % title
  \\node[anchor=north west,inner sep=0,text=CoverNavy,align=left,text width=160mm,font=\\rmfamily\\bfseries\\fontsize{24}{28}\\selectfont]
    at ([xshift=28mm,yshift=-72mm]current page.north west)
    {${title}};
  % description
  \\node[anchor=north west,inner sep=0pt,text=CoverGray,align=left,text width=140mm,font=\\rmfamily\\fontsize{10.5}{14}\\selectfont]
    at ([xshift=28mm,yshift=-94mm]current page.north west)
    {\\begin{minipage}[t]{140mm}\\raggedright
      ${r.text(p.description, where)}
    \\end{minipage}};
${
  logo
    ? `  % project logo
  \\node[anchor=north,inner sep=0] at ([xshift=105mm,yshift=-126mm]current page.north west)
    {\\includegraphics[width=130mm,height=110mm,keepaspectratio]{${logo}}};\n`
    : ""
}  % academic year and copyright
  \\node[anchor=center,inner sep=0,text=CoverNavy,font=\\rmfamily\\bfseries\\fontsize{14}{16}\\selectfont]
    at ([xshift=105mm,yshift=-263mm]current page.north west) {Academic Year ${r.text(book.academicYear, where)}};
  \\node[anchor=center,inner sep=0,text=CoverGray,font=\\rmfamily\\fontsize{12}{14}\\selectfont]
    at ([xshift=105mm,yshift=-278mm]current page.north west) {${r.text(book.copyright, where)}};
\\end{tikzpicture}
\\clearpage
`;
}

/** Rows of at most 4 cards, with the larger rows at the bottom (7 -> 3 + 4). */
export function profileRows<T>(items: T[]): T[][] {
  if (!items.length) return [];
  const rows = Math.ceil(items.length / 4);
  const base = Math.floor(items.length / rows);
  const extra = items.length % rows;
  const out: T[][] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const n = base + (r >= rows - extra ? 1 : 0);
    out.push(items.slice(i, i + n));
    i += n;
  }
  return out;
}

function profileTex(r: Renderer, p: Project, people: Person[], dir: string): string {
  const where = `${p.name} team`;
  const rows = profileRows(people)
    .map((row) => {
      const gap = row.length >= 4 ? "8mm" : "10mm";
      const cards = row.map((m) => {
        const photo = r.assetPath(m.photoAssetId, `${dir}/assets`);
        const name = r.text(m.name, where);
        const role = r.text(m.role.toUpperCase().replace(/\s*\/\s*/g, "/"), where);
        return photo ? `\\profilemember{${photo}}{${name}}{${role}}` : `\\profilenophoto{${name}}{${role}}`;
      });
      return `\\begin{center}\n${cards.join(`%\n\\hspace{${gap}}%\n`)}\n\\end{center}`;
    })
    .join("\n\n\\vspace{10mm}\n\n");
  return `% Team profile page of ${p.name} (generated from the team list)
\\thispagestyle{empty}
\\newgeometry{left=20mm,right=20mm,top=8mm,bottom=25mm}
\\begin{tikzpicture}[remember picture, overlay]
  \\draw[ProfileBlue, line width=0.7pt]
    ([xshift=10mm,yshift=-12mm]current page.north west) rectangle
    ([xshift=-10mm,yshift=12mm]current page.south east);
\\end{tikzpicture}
\\begin{flushright}
\\tikz\\node[fill=ProfileBlue, text=white, font=\\bfseries\\large, rounded corners=3pt, inner xsep=16pt, inner ysep=8pt] {Profile};
\\end{flushright}

\\vspace{2mm}

{\\Large\\bfseries\\color{ProfileBlue} ${r.text(p.teamName || p.name, where)}}\\\\[3pt]

\\vspace{6mm}

${rows}

\\restoregeometry
\\clearpage
`;
}

function contributorsTex(r: Renderer, p: Project, people: Person[]): string {
  const where = `${p.name} contributors`;
  const card = (m: Person) =>
    `\\begin{minipage}[t]{0.48\\linewidth}
  \\textbf{${r.text(m.name, where)}}${m.role ? ` -- ${r.text(m.role, where)}` : ""}${
    m.email ? ` \\\\\n  \\textit{Email:} ${r.text(m.email, where)}` : ""
  }
\\end{minipage}`;
  const rows: string[] = [];
  for (let i = 0; i < people.length; i += 2) {
    const pair = people.slice(i, i + 2).map(card);
    rows.push(`\\noindent\n${pair.join("%\n\\hfill\n")}`);
  }
  return `\\vspace{1em}\n\n${rows.join("\n\n\\vspace{1em}\n\n")}\n\n\\vspace{1.5em}\n\n`;
}

// ---------------------------------------------------------------------------
// Sections

function sectionTex(r: Renderer, ctx: SerializeContext, s: Section, people: Person[], p: Project | null) {
  const where = `"${s.title}"`;
  ctx.where = where;
  const title = r.text(s.title.toUpperCase(), where);
  let out = `% ${s.title}\n`;
  if (s.newPage) out += "\\clearpage\n";
  if (s.kind === "FRONT") {
    out += `\\frontsection{${title}}\n\n`;
  } else {
    out += `\\section{${title}}\n\\label{${ctx.slug}:sec:${s.id.slice(0, 8)}}\n\n`;
  }
  out += serializeDoc(ctx, s.content);
  if (s.special === "contributors" && p) out += contributorsTex(r, p, people);
  return out;
}

function referencesTex(r: Renderer, p: Project, refs: Reference[]): string {
  if (!refs.length) return "";
  const items = refs.map((ref, i) => {
    const t = r.text(ref.text, `${p.name} references`);
    const url = ref.url ? `${t ? ": " : ""}\\url{${escapeUrl(ref.url)}}` : "";
    const end = /[.!?]$/.test(ref.url || ref.text) ? "" : ".";
    return `\\bibitem{${p.slug}:ref:${i + 1}} ${t}${url}${end}`;
  });
  return `% References
\\clearpage
\\phantomsection
\\section{REFERENCES}
\\label{${p.slug}:sec:references}
\\begin{thebibliography}{${refs.length}}
${items.join("\n")}
\\end{thebibliography}
`;
}

/**
 * Writes projects/<slug>/{cover,profile,front,body}.tex and the section
 * files. Returns the \input lines for the front part and the body part.
 */
function renderProjectFiles(r: Renderer, data: ProjectData, book: Book) {
  const { project: p, people, references } = data;
  const dir = `projects/${p.slug}`;
  const sorted = [...data.sections].sort((a, b) => a.order - b.order);
  const ctx: SerializeContext = {
    slug: p.slug,
    assetPath: (id) => r.assetPath(id, `${dir}/assets`),
    refKinds: collectRefKinds(sorted.map((s) => s.content)),
    warnings: r.warnings,
    usedLabels: new Set(),
  };

  r.files[`${dir}/cover.tex`] = coverTex(r, p, book, dir);
  r.files[`${dir}/profile.tex`] = profileTex(r, p, people, dir);

  const inputs = { FRONT: [] as string[], BODY: [] as string[], APPENDIX: [] as string[] };
  const kindOrder = { FRONT: 0, BODY: 1, APPENDIX: 2 } as const;
  sorted
    .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.order - b.order)
    .forEach((s, i) => {
      const file = `${dir}/sections/${String(i + 1).padStart(2, "0")}-${slugify(s.title)}`;
      r.files[`${file}.tex`] = sectionTex(r, ctx, s, people, p);
      inputs[s.kind].push(`\\input{${file}}`);
    });
  if (references.length) {
    r.files[`${dir}/references.tex`] = referencesTex(r, p, references);
    inputs.BODY.push(`\\input{${dir}/references}`);
  }

  r.files[`${dir}/front.tex`] = `% Front matter of ${p.name}\n${inputs.FRONT.join("\n")}\n\\clearpage\n`;
  r.files[`${dir}/body.tex`] =
    `% Body, references and appendices of ${p.name}\n${[...inputs.BODY, ...inputs.APPENDIX].join("\n")}\n`;
  return dir;
}

function tocTex(depth: number) {
  return `\\setcounter{tocdepth}{${depth}}
\\renewcommand{\\contentsname}{CONTENTS}
\\tableofcontents
\\clearpage
`;
}

/** A single project report, laid out like the original SQLyst document. */
export function renderProject(data: ProjectData, book: Book, assets: Map<string, Asset>): RenderResult {
  const r = new Renderer(assets);
  const p = data.project;
  const dir = renderProjectFiles(r, data, book);
  const footer = r.text(p.footerName || p.name, "footer");
  r.files["main.tex"] = `${PREAMBLE}
\\begin{document}
\\stepcounter{project}
\\setproject{${r.text(p.name, "name")}}{${footer}}

\\input{${dir}/cover}
\\input{${dir}/profile}

\\pagenumbering{arabic}
\\setcounter{page}{3}

\\input{${dir}/front}

${tocTex(2)}
\\input{${dir}/body}

\\end{document}
`;
  return r.result();
}

function bookCoverTex(r: Renderer, data: BookData): string {
  const b = data.book;
  const where = "book cover";
  const instLogo = r.assetPath(b.institutionLogoAssetId, "book/assets");
  const projects = data.projects
    .map((d) => `${r.text(d.project.name, where)}${d.project.tagline ? ` -- \\textit{${r.text(d.project.tagline, where)}}` : ""}`)
    .join("\\\\[2mm]\n      ");
  return `% Book cover (generated from the book settings)
\\thispagestyle{empty}
\\begin{tikzpicture}[remember picture,overlay]
  \\fill[CoverNavy] (current page.north west) rectangle ([xshift=10mm]current page.south west);
${
  instLogo
    ? `  \\node[anchor=north west,inner sep=0] at ([xshift=28mm,yshift=-25mm]current page.north west)
    {\\includegraphics[width=60mm]{${instLogo}}};\n`
    : ""
}  \\node[anchor=north west,inner sep=0,text=CoverGray,font=\\rmfamily\\bfseries\\fontsize{14}{16}\\selectfont]
    at ([xshift=28mm,yshift=-57mm]current page.north west) {${r.text(b.subtitle || "PROJECT REPORTS", where)}};
  \\node[anchor=north west,inner sep=0,text=CoverNavy,align=left,text width=160mm,font=\\rmfamily\\bfseries\\fontsize{26}{31}\\selectfont]
    at ([xshift=28mm,yshift=-72mm]current page.north west) {${r.text(b.title, where)}};
  \\node[anchor=north west,inner sep=0pt,text=CoverGray,align=left,text width=140mm,font=\\rmfamily\\fontsize{10.5}{14}\\selectfont]
    at ([xshift=28mm,yshift=-100mm]current page.north west)
    {\\begin{minipage}[t]{140mm}\\raggedright
      ${r.text(b.description, where)}
    \\end{minipage}};
  \\node[anchor=north west,inner sep=0pt,text=CoverNavy,align=left,text width=140mm,font=\\rmfamily\\fontsize{13}{17}\\selectfont]
    at ([xshift=28mm,yshift=-140mm]current page.north west)
    {\\begin{minipage}[t]{140mm}\\raggedright
      ${projects}
    \\end{minipage}};
  \\node[anchor=center,inner sep=0,text=CoverNavy,font=\\rmfamily\\bfseries\\fontsize{14}{16}\\selectfont]
    at ([xshift=105mm,yshift=-263mm]current page.north west) {Academic Year ${r.text(b.academicYear, where)}};
  \\node[anchor=center,inner sep=0,text=CoverGray,font=\\rmfamily\\fontsize{12}{14}\\selectfont]
    at ([xshift=105mm,yshift=-278mm]current page.north west) {${r.text(b.copyright, where)}};
\\end{tikzpicture}
\\clearpage
`;
}

/** The merged book: cover, preface, one table of contents, then every project. */
export function renderBook(data: BookData, assets: Map<string, Asset>): RenderResult {
  const r = new Renderer(assets);
  r.files["book/cover.tex"] = bookCoverTex(r, data);

  let preface = "";
  // An empty preface is left out rather than printed as a blank page.
  if (data.preface && plainText(data.preface.content).trim()) {
    const ctx: SerializeContext = {
      slug: "book",
      assetPath: (id) => r.assetPath(id, "book/assets"),
      refKinds: collectRefKinds([data.preface.content]),
      warnings: r.warnings,
      usedLabels: new Set(),
    };
    r.files["book/preface.tex"] = sectionTex(r, ctx, { ...data.preface, newPage: false }, [], null);
    preface = "\\input{book/preface}\n\\clearpage\n";
  }

  const parts = data.projects.map((d) => {
    const dir = renderProjectFiles(r, d, data.book);
    const p = d.project;
    return `% ---------------------------------------------------------------
\\projectpart{${r.text(p.name, "name")}}{${r.text(p.footerName || p.name, "footer")}}
\\input{${dir}/cover}
\\input{${dir}/profile}
\\input{${dir}/front}
\\input{${dir}/body}
`;
  });

  r.files["main.tex"] = `${PREAMBLE}
\\begin{document}
\\setproject{${r.text(data.book.title, "book title")}}{${r.text(data.book.title, "book title")}}

\\input{book/cover}
\\cleardoublepage
\\pagenumbering{arabic}
\\setcounter{page}{3}

${preface}
${tocTex(data.book.tocDepth)}
${parts.join("\n")}
\\end{document}
`;
  return r.result();
}
