import { plainText, type DocNode } from "@/lib/doc";

/**
 * The structured ("form") view of a section. A section document is a flat
 * list of blocks; headings split it into items, and a paragraph that opens
 * with a short bold label ("Why we chose it.", "How we solved it.") starts a
 * labelled box. Editors fill the boxes; the headings and labels stay put.
 *
 *   intro          text before the first subsection
 *   items[]        one per subsection / sub-subsection heading
 *     segments[]   the boxes under that heading, each an editor document
 */

export interface Segment {
  key: string;
  /** Bold lead-in printed at the start of the box, e.g. "Why we chose it." */
  label: string | null;
  doc: DocNode;
}

export interface OutlineItem {
  key: string;
  /** 2 = subsection (2.1), 3 = sub-subsection (2.1.1) */
  level: number;
  /** The stored heading node, reused when the title is not edited. */
  heading: DocNode;
  title: string;
  segments: Segment[];
}

export interface Outline {
  intro: Segment[];
  items: OutlineItem[];
}

/** React key for items and boxes. Random, so keys stay unique even when the dev server reloads this module. */
export const newKey = () => `k${Math.random().toString(36).slice(2, 12)}`;

const emptyBody = (): DocNode => ({ type: "doc", content: [{ type: "paragraph" }] });

const isBold = (n: DocNode) => n.marks?.length === 1 && n.marks[0].type === "bold";

/** A paragraph opening with a short bold phrase ending in "." or ":" is a labelled box. */
function splitLeadIn(block: DocNode): { label: string; rest: DocNode } | null {
  if (block.type !== "paragraph") return null;
  const [first, ...rest] = block.content ?? [];
  if (!first || first.type !== "text" || !isBold(first)) return null;
  const label = (first.text ?? "").trim();
  if (!/^[^.:]{2,40}[.:]$/.test(label)) return null;
  const content = [...rest];
  if (content[0]?.type === "text") {
    const text = (content[0].text ?? "").replace(/^\s+/, "");
    if (text) content[0] = { ...content[0], text };
    else content.shift();
  }
  return { label, rest: { ...block, content } };
}

export function docToOutline(doc: DocNode): Outline {
  const outline: Outline = { intro: [], items: [] };
  let target = outline.intro;
  for (const block of doc.content ?? []) {
    if (block.type === "heading") {
      const item: OutlineItem = {
        key: newKey(),
        level: Number(block.attrs?.level ?? 2) >= 3 ? 3 : 2,
        heading: block,
        title: plainText(block),
        segments: [],
      };
      outline.items.push(item);
      target = item.segments;
      continue;
    }
    const lead = splitLeadIn(block);
    if (lead) {
      target.push({ key: newKey(), label: lead.label, doc: { type: "doc", content: [lead.rest] } });
    } else if (target.length) {
      // Lists, figures and tables after a label belong to that box.
      target[target.length - 1].doc.content!.push(block);
    } else {
      target.push({ key: newKey(), label: null, doc: { type: "doc", content: [block] } });
    }
  }
  if (!outline.intro.length) outline.intro.push({ key: newKey(), label: null, doc: emptyBody() });
  for (const item of outline.items) {
    if (!item.segments.length) item.segments.push({ key: newKey(), label: null, doc: emptyBody() });
  }
  return outline;
}

const isEmptyBody = (d: DocNode) =>
  (d.content ?? []).every((b) => b.type === "paragraph" && !(b.content ?? []).length);

/** Joins adjacent text nodes with the same marks (what the editor does too). */
function mergeText(nodes: DocNode[]): DocNode[] {
  const out: DocNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev?.type === "text" && n.type === "text" && JSON.stringify(prev.marks ?? []) === JSON.stringify(n.marks ?? [])) {
      out[out.length - 1] = { ...prev, text: (prev.text ?? "") + (n.text ?? "") };
    } else out.push(n);
  }
  return out;
}

function segmentBlocks(seg: Segment): DocNode[] {
  const blocks = [...(seg.doc.content ?? [])];
  if (!seg.label) return isEmptyBody(seg.doc) ? [] : blocks;
  const lead: DocNode = { type: "text", text: seg.label, marks: [{ type: "bold" }] };
  const first = blocks[0];
  if (first?.type === "paragraph") {
    const rest = first.content ?? [];
    blocks[0] = { ...first, content: rest.length ? mergeText([lead, { type: "text", text: " " }, ...rest]) : [lead] };
  } else {
    blocks.unshift({ type: "paragraph", content: [lead] });
  }
  return blocks;
}

export function outlineToDoc(outline: Outline): DocNode {
  const content: DocNode[] = outline.intro.flatMap(segmentBlocks);
  for (const item of outline.items) {
    const heading =
      item.title === plainText(item.heading)
        ? { ...item.heading, attrs: { ...item.heading.attrs, level: item.level } }
        : {
            type: "heading",
            attrs: { ...item.heading.attrs, level: item.level },
            ...(item.title ? { content: [{ type: "text", text: item.title }] } : {}),
          };
    content.push(heading, ...item.segments.flatMap(segmentBlocks));
  }
  if (!content.length) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

/** A new, empty item with the same boxes as `like` (e.g. a technology with its "Why we chose it."). */
export function newItemLike(like: OutlineItem | undefined, level: number): OutlineItem {
  const labels = like?.segments.map((s) => s.label) ?? [null];
  return {
    key: newKey(),
    level,
    heading: { type: "heading", attrs: { level, numbered: true } },
    title: "",
    segments: labels.map((label) => ({ key: newKey(), label, doc: emptyBody() })),
  };
}

/** Index just past item i and the deeper items under it. */
export function subtreeEnd(items: OutlineItem[], i: number): number {
  let j = i + 1;
  while (j < items.length && items[j].level > items[i].level) j++;
  return j;
}

/** Heading numbers as printed ("2.1", "2.1.1"); "" for unnumbered headings. */
export function headingNumbers(items: OutlineItem[], chapter: number | null): string[] {
  let sub = 0;
  let subsub = 0;
  return items.map((it) => {
    if (chapter == null || it.heading.attrs?.numbered === false) return "";
    if (it.level === 2) {
      sub++;
      subsub = 0;
      return `${chapter}.${sub}`;
    }
    subsub++;
    return `${chapter}.${sub}.${subsub}`;
  });
}
