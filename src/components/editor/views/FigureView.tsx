"use client";

import { useRef, useState } from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { FIGURE_WIDTHS, type FigureWidth } from "@/lib/doc";
import { assetUrl, useEditorEnv } from "../context";

const WIDTH_LABELS: Record<FigureWidth, string> = { S: "Small", M: "Medium", L: "Large", XL: "Full width" };

export function FigureView({ node, updateAttributes, deleteNode, editor, selected }: ReactNodeViewProps) {
  const env = useEditorEnv();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = editor.isEditable;
  const { assetId, caption, width } = node.attrs as { assetId: string | null; caption: string; width: FigureWidth };

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await env.uploadImage(file);
      updateAttributes({ assetId: asset.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <NodeViewWrapper
      className={`block-card my-4 ${selected ? "ring-2 ring-blue-400" : ""}`}
      data-drag-handle
      contentEditable={false}
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
        <span className="font-medium uppercase tracking-wide">Figure</span>
        {editable && (
          <div className="flex items-center gap-2">
            <select
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
              value={width}
              onChange={(e) => updateAttributes({ width: e.target.value })}
              title="Width on the page"
            >
              {(Object.keys(FIGURE_WIDTHS) as FigureWidth[]).map((w) => (
                <option key={w} value={w}>
                  {WIDTH_LABELS[w]}
                </option>
              ))}
            </select>
            {assetId && (
              <button type="button" className="icon-btn" title="Replace image" onClick={() => input.current?.click()}>
                <RefreshCw size={14} />
              </button>
            )}
            <button type="button" className="icon-btn text-red-600" title="Remove figure" onClick={deleteNode}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="flex justify-center bg-white p-3">
        {assetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(assetId)}
            alt={caption}
            style={{ width: `${FIGURE_WIDTHS[width] * 100}%` }}
            className="max-h-[480px] object-contain"
          />
        ) : (
          <button
            type="button"
            disabled={!editable || busy}
            onClick={() => input.current?.click()}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600"
          >
            <ImagePlus size={24} />
            {busy ? "Uploading…" : "Upload an image (PNG or JPEG)"}
          </button>
        )}
      </div>
      {error && <p className="px-3 pb-2 text-xs text-red-600">{error}</p>}
      <div className="border-t border-slate-200 px-3 py-2">
        <textarea
          className="w-full resize-none bg-transparent text-center text-sm italic text-slate-700 outline-none placeholder:text-slate-400"
          rows={2}
          placeholder="Caption: describe what the figure shows"
          value={caption}
          readOnly={!editable}
          onChange={(e) => updateAttributes({ caption: e.target.value.replace(/\n/g, " ") })}
        />
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </NodeViewWrapper>
  );
}
