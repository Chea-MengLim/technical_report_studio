"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { ColumnSpec } from "@/lib/doc";

function currentTable(editor: Editor): PMNode | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "table") return node;
  }
  return null;
}

/**
 * Settings of the table the cursor is in: caption, column widths and
 * alignment, rows and columns. Colours and borders come from the template.
 */
export function TablePanel({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const table = e.isEditable ? currentTable(e) : null;
      if (!table) return null;
      const firstRow = table.firstChild;
      const cols = firstRow?.childCount ?? 0;
      const headerRow = !!firstRow && firstRow.childCount > 0 && firstRow.firstChild?.type.name === "tableHeader";
      return {
        caption: String(table.attrs.caption ?? ""),
        columns: (table.attrs.columns as ColumnSpec[] | null) ?? [],
        cols,
        headerRow,
      };
    },
  });
  if (!state) return null;

  const chain = () => editor.chain().focus();
  const columns: ColumnSpec[] = Array.from(
    { length: state.cols },
    (_, i) => state.columns[i] ?? { align: "left", width: null },
  );
  const setColumn = (i: number, patch: Partial<ColumnSpec>) => {
    const next = columns.map((c, j) => (j === i ? { ...c, ...patch } : c));
    editor.chain().updateAttributes("table", { columns: next }).run();
  };

  return (
    <div className="sticky top-[42px] z-10 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Table</span>
        <input
          className="input min-w-64 flex-1"
          placeholder="Caption (shown above the table)"
          value={state.caption}
          onChange={(e) => editor.chain().updateAttributes("table", { caption: e.target.value }).run()}
        />
        <button className="btn" onClick={() => chain().addRowAfter().run()}>+ Row</button>
        <button className="btn" onClick={() => chain().deleteRow().run()}>− Row</button>
        <button
          className="btn"
          onClick={() => {
            chain().addColumnAfter().run();
            editor.chain().updateAttributes("table", { columns: [...columns, { align: "left", width: null }] }).run();
          }}
        >
          + Column
        </button>
        <button className="btn" disabled={state.cols <= 1} onClick={() => chain().deleteColumn().run()}>
          − Column
        </button>
        <button className="btn" onClick={() => chain().toggleHeaderRow().run()}>
          {state.headerRow ? "No header row" : "Header row"}
        </button>
        <button className="btn text-red-600" onClick={() => chain().deleteTable().run()}>
          Delete table
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
        {columns.map((c, i) => (
          <div key={i} className="flex items-center gap-1 rounded border border-amber-200 bg-white px-2 py-1">
            <span className="font-medium">Col {i + 1}</span>
            <select
              className="rounded border border-slate-200 px-1"
              value={c.width ? "fixed" : "auto"}
              onChange={(e) => setColumn(i, { width: e.target.value === "fixed" ? 3 : null })}
            >
              <option value="auto">Fill</option>
              <option value="fixed">Fixed</option>
            </select>
            {c.width !== null && (
              <>
                <input
                  type="number"
                  min={1}
                  max={15}
                  step={0.1}
                  className="w-14 rounded border border-slate-200 px-1"
                  value={c.width}
                  onChange={(e) => setColumn(i, { width: Math.max(0.5, Number(e.target.value) || 1) })}
                />
                cm
              </>
            )}
            <select
              className="rounded border border-slate-200 px-1"
              value={c.align}
              onChange={(e) => setColumn(i, { align: e.target.value as ColumnSpec["align"] })}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
