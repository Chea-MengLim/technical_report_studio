"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { uploadAsset, assetUrl } from "@/components/editor/context";

/** Uploads an image to RustFS and hands the new asset id to `save`. */
export function ImageUploadField({
  assetId,
  projectId,
  save,
  hint,
  className = "h-32 w-56",
}: {
  assetId: string | null;
  projectId: string | null;
  save: (assetId: string | null) => Promise<void>;
  hint?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div>
      <div className="flex items-end gap-3">
        <div
          className={`flex items-center justify-center overflow-hidden rounded border border-slate-300 bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:16px_16px] ${className}`}
        >
          {assetId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(assetId)} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">No image</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn" disabled={pending} onClick={() => input.current?.click()}>
            <ImagePlus size={15} /> {pending ? "Uploading…" : assetId ? "Replace" : "Upload"}
          </button>
          {assetId && (
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={() => start(async () => {
                await save(null);
                router.refresh();
              })}
            >
              <X size={15} /> Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="hint">{hint}</p>}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          start(async () => {
            try {
              const asset = await uploadAsset(file, projectId);
              await save(asset.id);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed");
            }
          });
        }}
      />
    </div>
  );
}
