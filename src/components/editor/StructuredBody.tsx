"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2 } from "lucide-react";
import type { DocNode } from "@/lib/doc";
import {
  docToOutline,
  headingNumbers,
  newItemLike,
  outlineToDoc,
  subtreeEnd,
  type Outline,
  type OutlineItem,
  type Segment,
} from "@/lib/outline";
import { editorExtensions } from "./extensions";

export interface StructuredBodyApi {
  getDoc(): DocNode;
}

interface Props {
  initial: DocNode;
  /** Arabic chapter number for "2.1"-style heading numbers; null = unnumbered section. */
  chapter: number | null;
  editable: boolean;
  apiRef: React.RefObject<StructuredBodyApi | null>;
  onChange: (doc: DocNode) => void;
  onActivate: (key: string, editor: Editor) => void;
}

/**
 * The section as a form: headings are single-line fields, the text under
 * each heading is a box, and labelled parts ("Why we chose it.") are boxes of
 * their own. Editors change the words; the layout of the report stays fixed.
 */
export function StructuredBody({ initial, chapter, editable, apiRef, onChange, onActivate }: Props) {
  const [outline, setOutline] = useState<Outline>(() => docToOutline(initial));
  const outlineRef = useRef(outline);
  const editors = useRef(new Map<string, Editor>());
  const first = useRef(true);

  const getDoc = () => {
    const withText = (s: Segment): Segment => ({ ...s, doc: (editors.current.get(s.key)?.getJSON() as DocNode) ?? s.doc });
    const o = outlineRef.current;
    return outlineToDoc({
      intro: o.intro.map(withText),
      items: o.items.map((it) => ({ ...it, segments: it.segments.map(withText) })),
    });
  };
  useEffect(() => {
    apiRef.current = { getDoc };
  });

  // Titles and structure live in React state; report them after they change.
  useEffect(() => {
    outlineRef.current = outline;
    if (first.current) {
      first.current = false;
      return;
    }
    onChange(getDoc());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outline]);

  const numbers = useMemo(() => headingNumbers(outline.items, chapter), [outline.items, chapter]);
  const setItems = (fn: (items: OutlineItem[]) => OutlineItem[]) => setOutline((o) => ({ ...o, items: fn(o.items) }));

  const box = (seg: Segment, hint: string) => (
    <SegmentBox
      key={seg.key}
      seg={seg}
      hint={hint}
      editable={editable}
      onReady={(e) => {
        if (e) editors.current.set(seg.key, e);
        else editors.current.delete(seg.key);
      }}
      onEdit={() => onChange(getDoc())}
      onActivate={(e) => onActivate(seg.key, e)}
    />
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Opening text</div>
        {outline.intro.map((s) => box(s, "Text before the first subsection…"))}
      </div>

      {outline.items.map((item, i) => (
        <ItemBlock
          key={item.key}
          item={item}
          number={numbers[i]}
          editable={editable}
          canUp={siblingBefore(outline.items, i) >= 0}
          canDown={siblingAfter(outline.items, i) >= 0}
          onTitle={(title) => setItems((items) => items.map((it) => (it.key === item.key ? { ...it, title } : it)))}
          onMove={(dir) => setItems((items) => move(items, i, dir))}
          onAddAfter={() =>
            setItems((items) => {
              const at = subtreeEnd(items, i);
              return [...items.slice(0, at), newItemLike(item, item.level), ...items.slice(at)];
            })
          }
          onAddChild={
            item.level === 2
              ? () =>
                  setItems((items) => {
                    const at = subtreeEnd(items, i);
                    const lastChild = at - 1 > i ? items[at - 1] : undefined;
                    return [...items.slice(0, at), newItemLike(lastChild, 3), ...items.slice(at)];
                  })
              : undefined
          }
          onDelete={() => setItems((items) => [...items.slice(0, i), ...items.slice(subtreeEnd(items, i))])}
        >
          {item.segments.map((s) =>
            box(s, s.label ? `Write "${s.label.replace(/[.:]$/, "").toLowerCase()}"…` : "Write the content of this part…"),
          )}
        </ItemBlock>
      ))}

      {editable && (
        <button
          className="flex w-full items-center justify-center gap-2 rounded border-2 border-dashed border-slate-300 py-2 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-700"
          onClick={() => {
            const lastSub = [...outline.items].reverse().find((it) => it.level === 2);
            setItems((items) => [...items, newItemLike(lastSub, 2)]);
          }}
        >
          <Plus size={15} /> Add subsection
        </button>
      )}
    </div>
  );
}

function ItemBlock({
  item,
  number,
  editable,
  canUp,
  canDown,
  onTitle,
  onMove,
  onAddAfter,
  onAddChild,
  onDelete,
  children,
}: {
  item: OutlineItem;
  number: string;
  editable: boolean;
  canUp: boolean;
  canDown: boolean;
  onTitle: (t: string) => void;
  onMove: (dir: -1 | 1) => void;
  onAddAfter: () => void;
  onAddChild?: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  const sub = item.level === 3;
  return (
    <section className={sub ? "ml-8 border-l-2 border-slate-200 pl-4" : "pt-2"}>
      <div className="group mb-1.5 flex items-center gap-2">
        {number && <span className={`shrink-0 font-semibold text-slate-500 ${sub ? "text-sm" : ""}`}>{number}</span>}
        <input
          className={`min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 read-only:border-transparent read-only:bg-transparent ${
            sub ? "text-[15px]" : "text-lg"
          }`}
          value={item.title}
          readOnly={!editable}
          placeholder={sub ? "Heading (e.g. Python)" : "Subsection title"}
          onChange={(e) => onTitle(e.target.value)}
        />
        {editable && (
          <div className="flex shrink-0 items-center gap-0.5 text-slate-400">
            {confirm ? (
              <span className="flex items-center gap-1 text-xs">
                <span className="text-slate-600">{onAddChild ? "Delete with its sub-headings?" : "Delete?"}</span>
                <button className="rounded bg-red-600 px-1.5 py-0.5 text-white" onClick={onDelete}>
                  Delete
                </button>
                <button className="px-1 text-slate-500" onClick={() => setConfirm(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <>
                <button className="icon-btn" title="Move up" disabled={!canUp} onClick={() => onMove(-1)}>
                  <ArrowUp size={14} />
                </button>
                <button className="icon-btn" title="Move down" disabled={!canDown} onClick={() => onMove(1)}>
                  <ArrowDown size={14} />
                </button>
                {onAddChild && (
                  <button className="icon-btn" title="Add a sub-heading inside (e.g. another technology)" onClick={onAddChild}>
                    <CornerDownRight size={14} />
                  </button>
                )}
                <button className="icon-btn" title={sub ? "Add another heading like this one below" : "Add a subsection below"} onClick={onAddAfter}>
                  <Plus size={14} />
                </button>
                <button className="icon-btn hover:text-red-600" title="Delete" onClick={() => setConfirm(true)}>
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function SegmentBox({
  seg,
  hint,
  editable,
  onReady,
  onEdit,
  onActivate,
}: {
  seg: Segment;
  hint: string;
  editable: boolean;
  onReady: (e: Editor | null) => void;
  onEdit: () => void;
  onActivate: (e: Editor) => void;
}) {
  const baseline = useRef<string | null>(null);
  const cb = useRef({ onEdit, onActivate });
  useEffect(() => {
    cb.current = { onEdit, onActivate };
  });

  const editor = useEditor({
    extensions: editorExtensions({ headings: false, placeholder: hint }),
    content: seg.doc,
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "report-content min-h-[1.6em] outline-none" } },
    // Loading normalises the document (default attributes); that is not an edit.
    onCreate: ({ editor: e }) => {
      baseline.current = JSON.stringify(e.getJSON());
    },
    onUpdate: ({ editor: e }) => {
      if (baseline.current !== null && JSON.stringify(e.getJSON()) === baseline.current) return;
      baseline.current = null;
      cb.current.onEdit();
    },
    onFocus: ({ editor: e }) => cb.current.onActivate(e),
  });

  useEffect(() => {
    if (!editor) return;
    onReady(editor);
    return () => onReady(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  return (
    <div
      className={`rounded border bg-white px-4 py-2.5 ${
        editable ? "border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100" : "border-slate-200"
      }`}
    >
      {seg.label && (
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-800">
          {seg.label.replace(/[.:]$/, "")}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

// ------------------------------------------------------------ moving items

function siblingBefore(items: OutlineItem[], i: number): number {
  for (let j = i - 1; j >= 0; j--) {
    if (items[j].level < items[i].level) return -1;
    if (items[j].level === items[i].level) return j;
  }
  return -1;
}

function siblingAfter(items: OutlineItem[], i: number): number {
  const j = subtreeEnd(items, i);
  return j < items.length && items[j].level === items[i].level ? j : -1;
}

/** Swaps an item (with its sub-headings) and its previous or next sibling. */
function move(items: OutlineItem[], i: number, dir: -1 | 1): OutlineItem[] {
  const [a, b] = dir === -1 ? [siblingBefore(items, i), i] : [i, siblingAfter(items, i)];
  if (a < 0 || b < 0) return items;
  const aEnd = subtreeEnd(items, a);
  const bEnd = subtreeEnd(items, b);
  return [...items.slice(0, a), ...items.slice(b, bEnd), ...items.slice(a, aEnd), ...items.slice(bEnd)];
}
