import type { ColumnSpec, DocNode, FigureWidth, Mark } from "@/lib/doc";

/**
 * Converts the LaTeX used in the SQLyst report into editor documents.
 * It understands the constructs that report uses (sections, itemize,
 * tabularx tables, \projfigure, lstlisting, \textbf ...), not LaTeX in
 * general. Anything it does not recognise is reported in `warnings`.
 */

export interface ImportContext {
  projectName: string;
  /** LaTeX label (e.g. "tab:scope") -> refId */
  labels: Map<string, string>;
  /** Image file referenced by \projfigure -> assetId (filled by the caller). */
  resolveImage: (file: string) => string | null;
  warnings: string[];
}

export interface ImportedSection {
  title: string;
  newPage: boolean;
  content: DocNode;
}

// ---------------------------------------------------------------------------
// Low-level helpers

/** Reads a {...} group starting at src[i] === "{". Returns [inner, indexAfter]. */
export function readGroup(src: string, i: number): [string, number] {
  if (src[i] !== "{") throw new Error(`expected { at ${i}: ${src.slice(i, i + 30)}`);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return [src.slice(i + 1, j), j + 1];
    }
  }
  throw new Error("unbalanced braces");
}

/** Reads n consecutive {..} arguments (skipping whitespace between them). */
function readArgs(src: string, i: number, n: number): [string[], number] {
  const args: string[] = [];
  for (let k = 0; k < n; k++) {
    while (/\s/.test(src[i])) i++;
    const [g, next] = readGroup(src, i);
    args.push(g);
    i = next;
  }
  return [args, i];
}

export function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "\\") {
          i++;
          continue;
        }
        if (line[i] === "%") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

export function labelToRefId(label: string) {
  return label
    .replace(/^(tab|fig|lst):/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-");
}

/** Pre-pass: every figure/table/listing label, so \ref can point forward. */
export function collectLabels(src: string, labels: Map<string, string>) {
  for (const m of src.matchAll(/\\label\{((?:tab|fig|lst):[^}]+)\}|label=\{((?:tab|fig|lst):[^}]+)\}/g)) {
    const label = m[1] ?? m[2];
    labels.set(label, labelToRefId(label));
  }
  for (const m of src.matchAll(/\\projfigure\{[^}]*\}\{[^}]*\}\{(?:[^{}]|\{[^{}]*\})*\}\{([^}]+)\}/g)) {
    labels.set(m[1], labelToRefId(m[1]));
  }
}

// ---------------------------------------------------------------------------
// Inline

const LITERALS: [RegExp, string][] = [
  [/---/g, "—"],
  [/--/g, "–"],
  [/``/g, "“"],
  [/''/g, "”"],
  [/`/g, "‘"],
];

function cleanText(s: string) {
  let out = s.replace(/\s+/g, " ").replace(/~/g, " ");
  for (const [re, rep] of LITERALS) out = out.replace(re, rep);
  return out;
}

function pushText(out: DocNode[], text: string, marks: Mark[]) {
  if (!text) return;
  const last = out[out.length - 1];
  const sameMarks =
    last?.type === "text" && JSON.stringify(last.marks ?? []) === JSON.stringify(marks);
  if (sameMarks) last.text += text;
  else out.push(marks.length ? { type: "text", text, marks: [...marks] } : { type: "text", text });
}

const SIMPLE_ESCAPES: Record<string, string> = {
  "&": "&",
  _: "_",
  "%": "%",
  "#": "#",
  $: "$",
  "{": "{",
  "}": "}",
  " ": " ",
  ",": " ",
};

const DROP_COMMANDS = new Set([
  "noindent",
  "protect",
  "small",
  "footnotesize",
  "centering",
  "raggedright",
  "par",
  "newline",
  "hfill",
  "clearpage",
]);

export function parseInline(src: string, ctx: ImportContext, marks: Mark[] = []): DocNode[] {
  const out: DocNode[] = [];
  let buf = "";
  const flush = () => {
    pushText(out, cleanText(buf), marks);
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "{" || c === "}") {
      i++;
      continue;
    }
    if (c !== "\\") {
      buf += c;
      i++;
      continue;
    }
    // escaped single characters: \& \_ \%
    const next = src[i + 1];
    if (next in SIMPLE_ESCAPES) {
      buf += SIMPLE_ESCAPES[next];
      i += 2;
      continue;
    }
    if (next === "\\") {
      buf += " ";
      i += 2;
      continue;
    }
    const name = /^[a-zA-Z]+/.exec(src.slice(i + 1))?.[0] ?? "";
    let j = i + 1 + name.length;
    const skipEmptyGroup = () => {
      if (src.slice(j, j + 2) === "{}") j += 2;
    };
    const withMark = (mark: Mark) => {
      const [[arg], after] = readArgs(src, j, 1);
      flush();
      out.push(...parseInline(arg, ctx, [...marks, mark]));
      i = after;
    };
    switch (name) {
      case "textbf":
        withMark({ type: "bold" });
        continue;
      case "textit":
      case "emph":
        withMark({ type: "italic" });
        continue;
      case "code":
      case "texttt":
      case "file":
        withMark({ type: "code" });
        continue;
      case "href": {
        const [[url, label], after] = readArgs(src, j, 2);
        flush();
        out.push(...parseInline(label, ctx, [...marks, { type: "link", attrs: { href: url } }]));
        i = after;
        continue;
      }
      case "projname":
        flush();
        skipEmptyGroup();
        out.push({ type: "projectName", attrs: { name: ctx.projectName } });
        i = j;
        continue;
      case "projnameplain":
        skipEmptyGroup();
        buf += ctx.projectName;
        i = j;
        continue;
      case "institution":
        skipEmptyGroup();
        buf += "Korea Software HRD Center";
        i = j;
        continue;
      case "textcopyright":
        skipEmptyGroup();
        buf += "©";
        i = j;
        continue;
      case "ref": {
        const [[label], after] = readArgs(src, j, 1);
        const refId = ctx.labels.get(label);
        if (refId) {
          // "Table~\ref{x}" becomes one cross-reference node that prints "Table 1"
          buf = buf.replace(/(Table|Figure|Listing)[~\s]*$/, "");
          flush();
          out.push({ type: "crossRef", attrs: { refId } });
        } else {
          ctx.warnings.push(`unknown reference ${label}`);
          buf += "??";
        }
        i = after;
        continue;
      }
      default:
        if (DROP_COMMANDS.has(name)) {
          skipEmptyGroup();
          i = j;
          // "\noindent text": the space after a command word is not text
          while (src[i] === " ") i++;
          continue;
        }
        if (name === "vspace" || name === "hspace") {
          [, i] = readArgs(src, j, 1);
          continue;
        }
        ctx.warnings.push(`unsupported command \\${name} (text kept)`);
        i = j;
    }
  }
  flush();
  // Trim leading/trailing whitespace of the paragraph.
  if (out[0]?.type === "text") out[0].text = out[0].text!.replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last?.type === "text") last.text = last.text!.replace(/\s+$/, "");
  return out.filter((n) => n.type !== "text" || n.text);
}

// ---------------------------------------------------------------------------
// Blocks

function paragraph(src: string, ctx: ImportContext): DocNode | null {
  const content = parseInline(src, ctx);
  return content.length ? { type: "paragraph", content } : null;
}

function parseColumns(spec: string): ColumnSpec[] {
  const cols: ColumnSpec[] = [];
  const re = /([LCRlcrYZX])(\{([\d.]+)cm\})?/g;
  for (const m of spec.matchAll(re)) {
    const letter = m[1];
    const width = m[3] ? Number(m[3]) : null;
    const align = letter === "C" || letter === "Z" || letter === "c" ? "center" : "left";
    cols.push({ align, width: letter === "Y" || letter === "Z" || letter === "X" ? null : width });
  }
  return cols;
}

function splitCells(row: string): string[] {
  const cells: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === "\\") {
      cur += c + (row[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") depth--;
    if (c === "&" && depth === 0) {
      cells.push(cur);
      cur = "";
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

function parseTable(env: string, ctx: ImportContext): DocNode {
  let caption = "";
  let refId = "";
  const capIdx = env.indexOf("\\caption{");
  if (capIdx >= 0) caption = readGroup(env, capIdx + "\\caption".length)[0];
  const lab = /\\label\{([^}]+)\}/.exec(env);
  if (lab) refId = ctx.labels.get(lab[1]) ?? labelToRefId(lab[1]);

  const start = env.indexOf("\\begin{tabularx}");
  const [[, spec], bodyStart] = readArgs(env, start + "\\begin{tabularx}".length, 2);
  const body = env.slice(bodyStart, env.indexOf("\\end{tabularx}"));
  const columns = parseColumns(spec);

  const rows = body
    .split(/\\\\/)
    .map((r) => r.replace(/\\rowcolor\{[^}]*\}/g, "").trim())
    .filter(Boolean);
  const content: DocNode[] = rows.map((row) => {
    const header = row.includes("\\textcolor{white}");
    const cells = splitCells(row).map((cell) => {
      const text = cell.replace(/\\textcolor\{white\}\{\\textbf\{([^}]*)\}\}/g, "$1").trim();
      const para = paragraph(text, ctx);
      return {
        type: header ? "tableHeader" : "tableCell",
        content: [para ?? { type: "paragraph" }],
      };
    });
    return { type: "tableRow", content: cells };
  });
  return {
    type: "table",
    attrs: { caption: captionText(caption, ctx), refId, columns },
    content,
  };
}

/** Captions are plain text in the editor; inline code is written as `code`. */
function captionText(src: string, ctx: ImportContext): string {
  return parseInline(src, ctx)
    .map((n) =>
      n.type === "projectName"
        ? ctx.projectName
        : n.marks?.some((m) => m.type === "code")
          ? `\`${n.text}\``
          : (n.text ?? ""),
    )
    .join("")
    .replace(/ /g, " ");
}

function parseListing(opts: string, code: string, ctx: ImportContext): DocNode {
  const style = /style=(\w+)/.exec(opts)?.[1] ?? "python";
  const capMatch = /caption=\{/.exec(opts);
  const caption = capMatch ? readGroup(opts, capMatch.index + "caption=".length)[0] : "";
  const label = /label=\{([^}]+)\}/.exec(opts)?.[1];
  const language = style === "json" ? "json" : style === "python" || style === "snippet" ? "python" : "plain";
  const text = code.replace(/^\n/, "").replace(/\n\s*$/, "");
  return {
    type: "codeBlock",
    attrs: {
      language,
      caption: captionText(caption, ctx),
      refId: label ? (ctx.labels.get(label) ?? labelToRefId(label)) : "",
    },
    content: text ? [{ type: "text", text }] : [],
  };
}

function parseItemize(body: string, ctx: ImportContext): DocNode {
  const items = body
    .split(/\\item\b/)
    .slice(1)
    .map((item) => ({
      type: "listItem",
      content: [paragraph(item.trim(), ctx) ?? { type: "paragraph" }],
    }));
  return { type: "bulletList", content: items };
}

function widthPreset(w: number): FigureWidth {
  if (w >= 0.93) return "XL";
  if (w >= 0.8) return "L";
  if (w >= 0.6) return "M";
  return "S";
}

/**
 * Parses a sections/*.tex file into top-level sections. Text before the
 * first \section (in front-matter files) becomes an untitled section.
 */
export function parseSectionsFile(raw: string, ctx: ImportContext): ImportedSection[] {
  // Take listings out first: their content is verbatim (and may contain %).
  const listings: { opts: string; code: string }[] = [];
  let src = raw.replace(
    /\\begin\{lstlisting\}(\[[^\n]*\])?\n?([\s\S]*?)\\end\{lstlisting\}/g,
    (_, opts: string | undefined, code: string) => {
      listings.push({ opts: opts ?? "", code });
      return `\\LISTING{${listings.length - 1}}`;
    },
  );
  src = stripComments(src);

  const sections: ImportedSection[] = [];
  let current: ImportedSection | null = null;
  let pendingPageBreak = false;
  let para = "";

  const blocksOf = () => {
    if (!current) {
      current = { title: "", newPage: false, content: { type: "doc", content: [] } };
      sections.push(current);
    }
    return current.content.content!;
  };
  const flushPara = () => {
    const text = para.trim();
    para = "";
    if (!text) return;
    const p = paragraph(text, ctx);
    if (p) blocksOf().push(p);
  };
  const addBlock = (n: DocNode) => {
    flushPara();
    if (pendingPageBreak) {
      blocksOf().push({ type: "pageBreak" });
      pendingPageBreak = false;
    }
    blocksOf().push(n);
  };

  let i = 0;
  while (i < src.length) {
    // paragraph break
    if (src[i] === "\n" && /^\n[ \t]*\n/.test(src.slice(i, i + 50))) {
      flushPara();
      i++;
      continue;
    }
    if (src[i] !== "\\") {
      para += src[i++];
      continue;
    }
    const name = /^[a-zA-Z]+\*?/.exec(src.slice(i + 1))?.[0] ?? "";
    const j = i + 1 + name.length;

    if (name === "section" || name === "section*") {
      flushPara();
      const [[title], after] = readArgs(src, j, 1);
      current = {
        title: cleanText(title).replace(/ /g, " ").trim(),
        newPage: pendingPageBreak,
        content: { type: "doc", content: [] },
      };
      pendingPageBreak = false;
      sections.push(current);
      i = after;
    } else if (/^(sub)?subsection\*?$/.test(name)) {
      const [[title], after] = readArgs(src, j, 1);
      addBlock({
        type: "heading",
        attrs: { level: name.startsWith("subsub") ? 3 : 2, numbered: !name.endsWith("*") },
        content: parseInline(title, ctx),
      });
      i = after;
    } else if (name === "label") {
      [, i] = readArgs(src, j, 1);
    } else if (name === "clearpage" || name === "newpage") {
      flushPara();
      pendingPageBreak = true;
      i = j;
    } else if (name === "holdspace" || name === "vspace" || name === "needspace") {
      [, i] = readArgs(src, j, 1);
    } else if (name === "projfigure") {
      const [[w, file, cap, label], after] = readArgs(src, j, 4);
      const assetId = ctx.resolveImage(file);
      if (!assetId) ctx.warnings.push(`image ${file} not found`);
      addBlock({
        type: "figure",
        attrs: {
          assetId,
          caption: captionText(cap, ctx),
          width: widthPreset(Number(w)),
          refId: ctx.labels.get(label) ?? labelToRefId(label),
        },
      });
      i = after;
    } else if (name === "LISTING") {
      const [[n], after] = readArgs(src, j, 1);
      const l = listings[Number(n)];
      addBlock(parseListing(l.opts, l.code, ctx));
      i = after;
    } else if (name === "begin") {
      const [[env], after] = readArgs(src, j, 1);
      const endTag = `\\end{${env}}`;
      const end = src.indexOf(endTag, after);
      const body = src.slice(after, end);
      if (env === "table") addBlock(parseTable(body, ctx));
      else if (env === "itemize") addBlock(parseItemize(body, ctx));
      else {
        ctx.warnings.push(`unsupported environment ${env} (skipped)`);
      }
      i = end + endTag.length;
    } else {
      // inline command: leave it for the paragraph parser
      para += src.slice(i, j);
      i = j;
    }
  }
  flushPara();
  for (const s of sections) {
    if (!s.content.content!.length) s.content.content!.push({ type: "paragraph" });
  }
  return sections;
}
