"use client";

import { useEffect, useRef, useState } from "react";

/** Output size: the profile page prints photos 2.7 cm x 3.3 cm. */
const OUT_W = 540;
const OUT_H = 660;
const VIEW_W = 270;
const VIEW_H = 330;

/** Displayed size of the photo: at zoom 1 it just covers the frame. */
function size(img: HTMLImageElement, zoom: number) {
  const scale = Math.max(VIEW_W / img.width, VIEW_H / img.height) * zoom;
  return { w: img.width * scale, h: img.height * scale };
}

/** Keeps the frame fully covered by the photo. */
function clamp(img: HTMLImageElement, zoom: number, o: { x: number; y: number }) {
  const { w, h } = size(img, zoom);
  return { x: Math.min(0, Math.max(VIEW_W - w, o.x)), y: Math.min(0, Math.max(VIEW_H - h, o.y)) };
}

/**
 * Lets the user move and zoom a photo inside a portrait frame, then
 * returns the cropped JPEG.
 */
export function PhotoCropper({
  file,
  onDone,
  onCancel,
}: {
  file: File;
  onDone: (cropped: File) => void;
  onCancel: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      // Start centred horizontally, a little above centre (faces are high in a portrait).
      const { w, h } = size(image, 1);
      setOffset(clamp(image, 1, { x: (VIEW_W - w) / 2, y: (VIEW_H - h) / 4 }));
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const { w, h } = img ? size(img, zoom) : { w: 0, h: 0 };

  function save() {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d")!;
    const k = OUT_W / VIEW_W;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.drawImage(img, offset.x * k, offset.y * k, w * k, h * k);
    canvas.toBlob(
      (blob) => blob && onDone(new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })),
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-sm p-5">
        <h2 className="font-semibold">Crop photo</h2>
        <p className="hint">Drag to move, use the slider to zoom.</p>
        <div
          className="relative mx-auto mt-4 cursor-move touch-none overflow-hidden rounded bg-slate-200"
          style={{ width: VIEW_W, height: VIEW_H }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d && img) setOffset(clamp(img, zoom, { x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
          }}
          onPointerUp={() => (drag.current = null)}
        >
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img.src}
              alt=""
              draggable={false}
              className="absolute max-w-none select-none"
              style={{ left: offset.x, top: offset.y, width: w, height: h }}
            />
          )}
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => {
            const z = Number(e.target.value);
            setZoom(z);
            if (img) setOffset((o) => clamp(img, z, o));
          }}
          className="mt-4 w-full"
          aria-label="Zoom"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!img} onClick={save}>
            Use photo
          </button>
        </div>
      </div>
    </div>
  );
}
