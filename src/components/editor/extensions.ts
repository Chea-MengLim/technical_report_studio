import { Node, mergeAttributes, ReactNodeViewRenderer, type Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import CodeBlock from "@tiptap/extension-code-block";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { newRefId } from "@/lib/doc";
import { FigureView } from "./views/FigureView";
import { CodeBlockView } from "./views/CodeBlockView";
import { CrossRefView } from "./views/CrossRefView";
import { ProjectNameView } from "./views/ProjectNameView";

/**
 * The editor schema. Only these nodes and marks exist, so pasted text
 * keeps its words, lists and emphasis but loses fonts, colours and sizes:
 * the book template owns the formatting.
 */

const refIdAttr = {
  refId: {
    default: null,
    parseHTML: () => newRefId(),
  },
};

export const SectionHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      numbered: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-numbered") !== "false",
        renderHTML: (attrs) => ({ "data-numbered": String(attrs.numbered) }),
      },
    };
  },
}).configure({ levels: [2, 3] });

export const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      assetId: { default: null },
      caption: { default: "" },
      width: { default: "L" },
      ...refIdAttr,
    };
  },
  parseHTML: () => [{ tag: "figure[data-figure]" }],
  renderHTML: ({ HTMLAttributes }) => ["figure", mergeAttributes(HTMLAttributes, { "data-figure": "" })],
  addNodeView: () => ReactNodeViewRenderer(FigureView),
});

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  parseHTML: () => [{ tag: "div[data-page-break]" }],
  renderHTML: () => ["div", { "data-page-break": "", class: "page-break" }, "Page break"],
});

export const ProjectName = Node.create({
  name: "projectName",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ name: { default: "" } }),
  parseHTML: () => [{ tag: "span[data-project-name]" }],
  renderHTML: ({ node }) => ["span", { "data-project-name": "" }, node.attrs.name],
  renderText: ({ node }) => node.attrs.name,
  addNodeView: () => ReactNodeViewRenderer(ProjectNameView),
});

export const CrossRef = Node.create({
  name: "crossRef",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ refId: { default: null } }),
  parseHTML: () => [{ tag: "span[data-cross-ref]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { "data-cross-ref": "" })],
  addNodeView: () => ReactNodeViewRenderer(CrossRefView),
});

export const Listing = CodeBlock.extend({
  addAttributes() {
    return {
      language: { default: "python" },
      caption: { default: "" },
      ...refIdAttr,
    };
  },
  addNodeView: () => ReactNodeViewRenderer(CodeBlockView),
}).configure({ enableTabIndentation: true, tabSize: 4 });

export const ReportTable = Table.extend({
  addAttributes() {
    return {
      caption: { default: "" },
      columns: { default: [] },
      ...refIdAttr,
    };
  },
}).configure({ resizable: false });

/** Table cells hold paragraphs only (no lists or figures inside cells). */
const Cell = TableCell.extend({ content: "paragraph+" });
const Header = TableHeader.extend({ content: "paragraph+" });

export function editorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      strike: false,
      underline: false,
      horizontalRule: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    SectionHeading,
    Figure,
    PageBreak,
    ProjectName,
    CrossRef,
    Listing,
    ReportTable,
    TableRow,
    Header,
    Cell,
    Placeholder.configure({ placeholder: "Write here…" }),
  ];
}
