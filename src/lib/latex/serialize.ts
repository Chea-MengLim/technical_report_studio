import type { ColumnSpec, DocNode, Mark, RefKind } from "@/lib/doc";
import { FIGURE_WIDTHS, refKindOf, walk } from "@/lib/doc";
import { escapeCaption, escapeText, escapeUrl, sanitizeCode } from "./escape";

/**
 * Tiptap JSON -> LaTeX body, written in the conventions of the original
 * SQLyst report (config/commands.tex): \projfigure, [H] tables with a grey
 * header row and zebra striping, lstlisting styles, \projname ...
 */

export interface SerializeContext {
  /** Project slug, used to prefix every \label so projects never collide. */
  slug: string;
  /** Returns the path \includegraphics should use, or null if the asset is unknown. */
  assetPath: (assetId: string) => string | null;
  /** Kinds of every figure/table/listing in the project, for cross-references. */
  refKinds: Map<string, RefKind>;
  warnings: string[];
  /** Where we are, for warning messages. */
  where?: string;
  /** refIds already given a \label in this document. */
  usedLabels?: Set<string>;
}

const LABEL_PREFIX: Record<RefKind, string> = { figure: "fig", table: "tab", listing: "lst" };
const REF_NAME: Record<RefKind, string> = { figure: "Figure", table: "Table", listing: "Listing" };

export function labelFor(slug: string, kind: RefKind, refId: string) {
  return `${slug}:${LABEL_PREFIX[kind]}:${refId}`;
}

function warn(ctx: SerializeContext, msg: string) {
  ctx.warnings.push(ctx.where ? `${ctx.where}: ${msg}` : msg);
}

function text(ctx: SerializeContext, s: string, code = false, prevChar = "") {
  return escapeText(s, {
    code,
    prevChar,
    onUnsupported: (ch) =>
      warn(ctx, `character "${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}) cannot be printed and was replaced with "?"`),
  });
}

function caption(ctx: SerializeContext, s: string) {
  return escapeCaption(s, {
    onUnsupported: (ch) => warn(ctx, `character "${ch}" in a caption cannot be printed`),
  });
}

// ---------------------------------------------------------------------------
// Inline content

function applyMarks(ctx: SerializeContext, s: string, marks: Mark[] = [], prevChar = ""): string {
  const has = (t: Mark["type"]) => marks.some((m) => m.type === t);
  let out = has("code") ? `\\code{${text(ctx, s, true)}}` : text(ctx, s, false, prevChar);
  if (has("italic")) out = `\\textit{${out}}`;
  if (has("bold")) out = `\\textbf{${out}}`;
  const link = marks.find((m) => m.type === "link") as Extract<Mark, { type: "link" }> | undefined;
  if (link?.attrs?.href) out = `\\href{${escapeUrl(link.attrs.href)}}{${out}}`;
  return out;
}

export function inline(ctx: SerializeContext, nodes: DocNode[] = []): string {
  let out = "";
  // Last printed character, so a quote right after "SQLyst" closes instead of opening.
  let prev = "";
  for (const n of nodes) {
    switch (n.type) {
      case "text":
        out += applyMarks(ctx, n.text ?? "", n.marks, prev);
        prev = n.text?.slice(-1) ?? prev;
        continue;
      case "hardBreak":
        out += "\\newline{}\n";
        prev = "";
        continue;
      case "projectName":
        out += "\\projname{}";
        break;
      case "crossRef": {
        const refId = String(n.attrs?.refId ?? "");
        const kind = ctx.refKinds.get(refId);
        if (!kind) {
          warn(ctx, "a cross-reference points to a figure/table/listing that no longer exists");
          out += "??";
        } else {
          out += `${REF_NAME[kind]}~\\ref{${labelFor(ctx.slug, kind, refId)}}`;
        }
        break;
      }
      default:
        out += inline(ctx, n.content);
    }
    prev = "x"; // after a name or a reference, a quote closes
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blocks

/** Unique label for a figure/table/listing (pasted copies share a refId). */
function claimLabel(ctx: SerializeContext, kind: RefKind, refId: unknown): string | null {
  if (typeof refId !== "string" || !refId) return null;
  ctx.usedLabels ??= new Set();
  if (ctx.usedLabels.has(refId)) return null;
  ctx.usedLabels.add(refId);
  return labelFor(ctx.slug, kind, refId);
}

function figure(ctx: SerializeContext, n: DocNode): string {
  const assetId = String(n.attrs?.assetId ?? "");
  const path = assetId ? ctx.assetPath(assetId) : null;
  if (!path) {
    warn(ctx, "a figure has no image and was left out");
    return "";
  }
  const width = FIGURE_WIDTHS[(n.attrs?.width as keyof typeof FIGURE_WIDTHS) ?? "L"] ?? 0.9;
  const cap = String(n.attrs?.caption ?? "").trim();
  if (!cap) warn(ctx, "a figure has no caption");
  const label = claimLabel(ctx, "figure", n.attrs?.refId) ?? "";
  return `\\projfigure{${width.toFixed(2)}}{${path}}{${caption(ctx, cap)}}{${label}}\n\n`;
}

function cellText(ctx: SerializeContext, cell: DocNode): string {
  return (cell.content ?? [])
    .map((p) => (p.type === "paragraph" ? inline(ctx, p.content) : inline(ctx, [p])))
    .filter((s) => s.trim())
    .join(" \\newline ");
}

function columnType(c: ColumnSpec | undefined): string {
  const align = c?.align ?? "left";
  if (c?.width && c.width > 0) return `${align === "center" ? "C" : "L"}{${c.width}cm}`;
  return align === "center" ? "Z" : "Y";
}

function table(ctx: SerializeContext, n: DocNode): string {
  const rows = (n.content ?? []).filter((r) => r.type === "tableRow");
  if (!rows.length) return "";
  const colCount = Math.max(...rows.map((r) => r.content?.length ?? 0));
  const specs = (n.attrs?.columns as ColumnSpec[] | undefined) ?? [];
  const colSpec = Array.from({ length: colCount }, (_, i) => columnType(specs[i])).join(" ");

  const lines: string[] = [];
  let bodyIndex = 0;
  for (const row of rows) {
    const cells = row.content ?? [];
    const isHeader = cells.length > 0 && cells.every((c) => c.type === "tableHeader");
    const values = Array.from({ length: colCount }, (_, i) => (cells[i] ? cellText(ctx, cells[i]) : ""));
    if (isHeader) {
      lines.push(
        "\\rowcolor{HeaderGray}\n" +
          values.map((v) => `\\textcolor{white}{\\textbf{${v}}}`).join(" & ") +
          " \\\\",
      );
    } else {
      lines.push((bodyIndex % 2 === 1 ? "\\rowcolor{RowGray}\n" : "") + values.join(" & ") + " \\\\");
      bodyIndex++;
    }
  }

  const cap = String(n.attrs?.caption ?? "").trim();
  const label = claimLabel(ctx, "table", n.attrs?.refId);
  let out = "\\begin{table}[H]\n\\centering\n";
  if (cap) {
    out += `\\caption{${caption(ctx, cap)}}\n`;
    if (label) out += `\\label{${label}}\n`;
  } else {
    warn(ctx, "a table has no caption");
  }
  out += "\\small\n";
  out += `\\begin{tabularx}{\\linewidth}{${colSpec}}\n${lines.join("\n")}\n\\end{tabularx}\n\\end{table}\n\n`;
  return out;
}

const LISTING_OPTS: Record<string, string> = {
  python: "style=python",
  json: "style=json",
  sql: "style=highlight, language=SQL",
  javascript: "style=highlight, language=JavaScript",
  java: "style=highlight, language=Java",
  bash: "style=highlight, language=bash",
  html: "style=highlight, language=HTML",
  plain: "style=base",
};

function codeBlock(ctx: SerializeContext, n: DocNode): string {
  const lang = String(n.attrs?.language ?? "plain");
  const opts = [LISTING_OPTS[lang] ?? LISTING_OPTS.plain];
  const cap = String(n.attrs?.caption ?? "").trim();
  if (cap) {
    opts.push(`caption={${caption(ctx, cap)}}`);
    const label = claimLabel(ctx, "listing", n.attrs?.refId);
    if (label) opts.push(`label={${label}}`);
  }
  const code = sanitizeCode(
    (n.content ?? []).map((t) => t.text ?? "").join(""),
    (ch) => warn(ctx, `character "${ch}" in a code block cannot be printed and was replaced with "?"`),
  );
  return `\\begin{lstlisting}[${opts.join(", ")}]\n${code.replace(/\n+$/, "")}\n\\end{lstlisting}\n\n`;
}

function list(ctx: SerializeContext, n: DocNode, env: "itemize" | "enumerate"): string {
  const items = (n.content ?? []).map((item) => {
    const body = blocks(ctx, item.content ?? []).trim();
    return `  \\item ${body.replace(/\n\n+/g, "\n\n  ").replace(/\n(?!\n)/g, "\n  ")}`;
  });
  return `\\begin{${env}}\n${items.join("\n")}\n\\end{${env}}\n\n`;
}

function heading(ctx: SerializeContext, n: DocNode, next: DocNode | undefined, first: boolean): string {
  const level = Number(n.attrs?.level ?? 2);
  const cmd = level >= 3 ? "subsubsection" : "subsection";
  const star = n.attrs?.numbered === false ? "*" : "";
  const title = inline(ctx, n.content).trim();
  if (!title) return "";
  // A heading directly followed by a figure, table or listing would be left
  // alone at the foot of a page when that block moves on, so reserve room.
  // Not for the first heading of a section: it must stay with the section title.
  const bigNext = next && ["figure", "table", "codeBlock"].includes(next.type);
  const need = bigNext && !first ? "\\needspace{12\\baselineskip}\n" : "";
  return `${need}\\${cmd}${star}{${title}}\n\n`;
}

export function blocks(ctx: SerializeContext, nodes: DocNode[]): string {
  let out = "";
  nodes.forEach((n, i) => {
    switch (n.type) {
      case "paragraph": {
        const body = inline(ctx, n.content).trim();
        if (body) out += body + "\n\n";
        break;
      }
      case "heading":
        out += heading(ctx, n, nodes[i + 1], i === 0);
        break;
      case "bulletList":
        out += list(ctx, n, "itemize");
        break;
      case "orderedList":
        out += list(ctx, n, "enumerate");
        break;
      case "figure":
        out += figure(ctx, n);
        break;
      case "table":
        out += table(ctx, n);
        break;
      case "codeBlock":
        out += codeBlock(ctx, n);
        break;
      case "pageBreak":
        out += "\\clearpage\n\n";
        break;
      default:
        if (n.content) out += blocks(ctx, n.content);
    }
  });
  return out;
}

export function serializeDoc(ctx: SerializeContext, doc: DocNode): string {
  return blocks(ctx, doc.content ?? []);
}

/** Kinds of all referenceable nodes in a set of documents. */
export function collectRefKinds(docs: DocNode[]): Map<string, RefKind> {
  const map = new Map<string, RefKind>();
  for (const d of docs)
    walk(d, (n) => {
      const kind = refKindOf(n.type);
      const id = n.attrs?.refId;
      if (kind && typeof id === "string" && id && !map.has(id)) map.set(id, kind);
    });
  return map;
}
