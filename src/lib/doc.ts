/**
 * The document model shared by the editor (Tiptap), the LaTeX serializer,
 * the validator and the SQLyst importer. It is plain Tiptap/ProseMirror JSON,
 * restricted to the node and mark types listed here: anything else is
 * formatting that the book template owns.
 */

export type Mark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "code" }
  | { type: "link"; attrs: { href: string } };

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: Mark[];
}

/** Figure width presets, as a fraction of \linewidth. */
export const FIGURE_WIDTHS = {
  S: 0.5,
  M: 0.7,
  L: 0.9,
  XL: 0.95,
} as const;
export type FigureWidth = keyof typeof FIGURE_WIDTHS;

export const CODE_LANGUAGES = {
  python: "Python",
  json: "JSON",
  sql: "SQL",
  javascript: "JavaScript / TypeScript",
  java: "Java",
  bash: "Shell",
  html: "HTML / XML",
  plain: "Plain text",
} as const;
export type CodeLanguage = keyof typeof CODE_LANGUAGES;

export interface ColumnSpec {
  align: "left" | "center";
  /** Fixed width in cm; null = share the remaining width. */
  width: number | null;
}

export type RefKind = "figure" | "table" | "listing";

export interface RefTarget {
  refId: string;
  kind: RefKind;
  caption: string;
  sectionId: string;
  sectionTitle: string;
}

export const emptyDoc = (): DocNode => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});

export function newRefId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function refKindOf(nodeType: string): RefKind | null {
  if (nodeType === "figure") return "figure";
  if (nodeType === "table") return "table";
  if (nodeType === "codeBlock") return "listing";
  return null;
}

const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "hardBreak",
  "figure",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "codeBlock",
  "pageBreak",
  "projectName",
  "crossRef",
]);
const ALLOWED_MARKS = new Set(["bold", "italic", "code", "link"]);

/**
 * Server-side guard: keeps only the node and mark types the book template
 * knows. Unknown wrappers are unwrapped so their text survives.
 */
export function sanitizeDoc(node: DocNode): DocNode {
  const clean = (n: DocNode): DocNode[] => {
    if (!n || typeof n !== "object" || typeof n.type !== "string") return [];
    const children = (n.content ?? []).flatMap(clean);
    if (!ALLOWED_NODES.has(n.type)) return children;
    const out: DocNode = { type: n.type };
    if (n.attrs && typeof n.attrs === "object") out.attrs = n.attrs;
    if (n.type === "text") {
      out.text = String(n.text ?? "");
      const marks = (n.marks ?? []).filter((m) => ALLOWED_MARKS.has(m?.type));
      if (marks.length) out.marks = marks;
    }
    if (n.content) out.content = children;
    return [out];
  };
  const [doc] = clean(node);
  return doc?.type === "doc" ? doc : emptyDoc();
}

/** Visit every node depth-first. */
export function walk(node: DocNode, fn: (n: DocNode, parent: DocNode | null) => void, parent: DocNode | null = null) {
  fn(node, parent);
  for (const child of node.content ?? []) walk(child, fn, node);
}

/** Plain text of a node (used for table cell previews, captions, etc.). */
export function plainText(node: DocNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "projectName") return String(node.attrs?.name ?? "");
  return (node.content ?? []).map(plainText).join("");
}

/** All figures, tables and code listings that can be cross-referenced. */
export function collectRefTargets(
  sections: { id: string; title: string; content: DocNode }[],
): RefTarget[] {
  const out: RefTarget[] = [];
  for (const s of sections) {
    walk(s.content, (n) => {
      const kind = refKindOf(n.type);
      const refId = n.attrs?.refId;
      if (kind && typeof refId === "string" && refId) {
        out.push({
          refId,
          kind,
          caption: String(n.attrs?.caption ?? ""),
          sectionId: s.id,
          sectionTitle: s.title,
        });
      }
    });
  }
  return out;
}
