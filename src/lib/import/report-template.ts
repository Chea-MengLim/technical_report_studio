import fs from "node:fs";
import path from "node:path";
import { db, schema } from "@/db";
import { createAsset } from "@/lib/assets";
import type { DocNode } from "@/lib/doc";
import {
  collectLabels,
  parseInline,
  parseSectionsFile,
  readGroup,
  stripComments,
  type ImportContext,
} from "@/lib/import/latex-to-doc";

/** The finished SQLyst report, copied from SQLyst_Report_Overleaf. New projects start from it. */
export const SQLYST_TEMPLATE_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "templates", "sqlyst");

type NewSection = typeof schema.sections.$inferInsert;

/**
 * Fills a project with the sections (in table-of-contents order), figures and
 * references of a report written in the SQLyst LaTeX layout. The project name
 * is a live field in the text, so the report reads with the new project's name.
 */
export async function importReportContent(projectId: string, projectName: string, root = SQLYST_TEMPLATE_DIR) {
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
  const warnings: string[] = [];

  // --------------------------------------------------------------- images
  const figuresDir = path.join(root, "figures");
  const figureFiles = fs.existsSync(figuresDir) ? fs.readdirSync(figuresDir) : [];
  const sectionFiles = fs
    .readdirSync(path.join(root, "sections"))
    .filter((f) => f.endsWith(".tex"))
    .sort();
  const allSrc = sectionFiles.map((f) => read(`sections/${f}`)).join("\n");

  const imageIds = new Map<string, string>();
  for (const [, file] of allSrc.matchAll(/\\projfigure\{[^}]*\}\{([^}]+)\}/g)) {
    if (imageIds.has(file)) continue;
    const name = figureFiles.find((f) => f === file || f.replace(/\.(png|jpe?g|pdf)$/i, "") === file);
    if (!name) continue;
    const asset = await createAsset(projectId, fs.readFileSync(path.join(figuresDir, name)), name);
    imageIds.set(file, asset.id);
  }

  const ctx: ImportContext = {
    projectName,
    labels: new Map(),
    resolveImage: (file) => imageIds.get(file) ?? null,
    warnings,
  };
  collectLabels(allSrc, ctx.labels);

  // -------------------------------------------------------- front matter
  const front = (file: string) =>
    read(file)
      .replace(/\{\\raggedright[^\n]*\\par\}/, "") // hand-written title
      .replace(/\\vspace\{[^}]*\}/g, "")
      .replace(/\\clearpage/g, "");
  const doc = (src: string): DocNode => ({
    type: "doc",
    content: stripComments(src)
      .split(/\n\s*\n/)
      .map((p) => parseInline(p, ctx))
      .filter((c) => c.length)
      .map((content) => ({ type: "paragraph", content })),
  });

  // Same order as the report's table of contents.
  const rows: NewSection[] = [
    {
      kind: "FRONT",
      title: "Project Contributors",
      newPage: true,
      special: "contributors",
      content: doc(front("frontmatter/aboutauthor.tex").split(/%\s*Row 1/)[0]),
    },
    { kind: "FRONT", title: "Acknowledgement", newPage: false, content: doc(front("frontmatter/acknowledgement.tex")) },
    { kind: "FRONT", title: "Executive Summary", newPage: true, content: doc(front("frontmatter/preface.tex")) },
  ];

  // ----------------------------------------------------------- chapters
  for (const file of sectionFiles) {
    warnings.push(`--- ${file}`);
    for (const s of parseSectionsFile(read(`sections/${file}`), ctx)) {
      if (!s.title) continue;
      const kind = /append/i.test(s.title) ? "APPENDIX" : "BODY";
      rows.push({ kind, title: titleCase(s.title), newPage: s.newPage, content: s.content });
    }
  }
  // FRONT, then BODY, then APPENDIX, keeping file order inside each group.
  const rank = { FRONT: 0, BODY: 1, APPENDIX: 2 } as const;
  rows.sort((a, b) => rank[a.kind!] - rank[b.kind!]);

  for (const [order, r] of rows.entries()) {
    const [section] = await db
      .insert(schema.sections)
      .values({ ...r, projectId, order })
      .returning();
    await db.insert(schema.sectionRevisions).values({
      sectionId: section.id,
      title: section.title,
      content: section.content,
    });
  }

  // ---------------------------------------------------------- references
  const bibFile = path.join(root, "references.bib");
  const bib = fs.existsSync(bibFile) ? fs.readFileSync(bibFile, "utf8") : "";
  const entries = [...bib.matchAll(/@\w+\{[^,]+,\s*key\s*=\s*\{([^}]+)\},\s*howpublished\s*=\s*/g)]
    .map((m) => {
      const [how] = readGroup(bib, m.index! + m[0].length);
      const url = /\\url\{([^}]+)\}/.exec(how)?.[1] ?? "";
      const text = how.replace(/\\url\{[^}]+\}/, "").replace(/:\s*$/, "").trim();
      return { key: m[1], text, url };
    })
    .sort((a, b) => a.key.localeCompare(b.key)); // bibliographystyle{plain} sorts by key
  if (entries.length) {
    await db
      .insert(schema.references)
      .values(entries.map((e, order) => ({ projectId, order, text: e.text, url: e.url })));
  }

  return { sections: rows.length, references: entries.length, figures: imageIds.size, warnings };
}

/** "RELATED TECHNOLOGIES" -> "Related Technologies" (the PDF prints titles in capitals anyway). */
function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(And|Of|The|In|For|To)\b/g, (w) => w.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase());
}
