"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";
import { CODE_LANGUAGES } from "@/lib/doc";

export function CodeBlockView({ node, updateAttributes, deleteNode, editor, selected }: ReactNodeViewProps) {
  const editable = editor.isEditable;
  const { language, caption } = node.attrs as { language: string; caption: string };
  return (
    <NodeViewWrapper className={`block-card my-4 ${selected ? "ring-2 ring-blue-400" : ""}`}>
      <div
        contentEditable={false}
        className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500"
      >
        <span className="font-medium uppercase tracking-wide">Code listing</span>
        {editable && (
          <div className="flex items-center gap-2">
            <select
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
              value={language}
              onChange={(e) => updateAttributes({ language: e.target.value })}
            >
              {Object.entries(CODE_LANGUAGES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button type="button" className="icon-btn text-red-600" title="Remove listing" onClick={deleteNode}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      <pre className="max-h-[520px] overflow-auto bg-[#f8f8f8] px-3 py-2 font-mono text-[12.5px] leading-snug text-slate-800">
        <NodeViewContent<"code"> as="code" />
      </pre>
      <div contentEditable={false} className="border-t border-slate-200 px-3 py-2">
        <input
          className="w-full bg-transparent text-center text-sm italic text-slate-700 outline-none placeholder:text-slate-400"
          placeholder="Caption (optional; needed to reference this listing). Use `backticks` for file names."
          value={caption}
          readOnly={!editable}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
        />
      </div>
    </NodeViewWrapper>
  );
}
