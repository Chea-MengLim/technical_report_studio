"use client";

import { useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  FileCode2,
  Hash,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Scissors,
  Table2,
  Tag,
  Undo2,
} from "lucide-react";
import { newRefId, type RefTarget } from "@/lib/doc";
import { REF_LABEL, useEditorEnv } from "./context";

function Btn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center gap-1 rounded px-1.5 text-sm transition-colors disabled:opacity-40 ${
        active ? "bg-blue-100 text-blue-700" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="mx-1 h-6 w-px bg-slate-200" />;

export function Toolbar({ editor, headings = true }: { editor: Editor; headings?: boolean }) {
  const env = useEditorEnv();
  const fileInput = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<null | "link" | "ref">(null);
  const [href, setHref] = useState("");
  const [uploading, setUploading] = useState(false);

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      editable: e.isEditable,
      block: e.isActive("heading", { level: 2 })
        ? "h2"
        : e.isActive("heading", { level: 3 })
          ? "h3"
          : "p",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      inTable: e.isActive("table"),
      inCode: e.isActive("codeBlock"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  if (!s.editable) return null;
  const chain = () => editor.chain().focus();

  async function insertFigure(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await env.uploadImage(file);
      chain()
        .insertContent({ type: "figure", attrs: { assetId: asset.id, caption: "", width: "L", refId: newRefId() } })
        .run();
    } catch (e) {
      alertInline(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function applyLink() {
    const url = href.trim();
    if (!url) chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: /^[a-z]+:/i.test(url) ? url : `https://${url}` }).run();
    setPanel(null);
  }

  const groups: [string, RefTarget[]][] = (["figure", "table", "listing"] as const).map((k) => [
    REF_LABEL[k],
    env.refTargets.filter((t) => t.kind === k),
  ]);

  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
        {headings && (
          <>
            <select
              className="h-8 rounded border border-slate-200 bg-white px-2 text-sm"
              value={s.block}
              disabled={s.inCode || s.inTable}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "p") chain().setParagraph().run();
                else chain().setHeading({ level: v === "h2" ? 2 : 3 }).run();
              }}
              title="Paragraph or subheading"
            >
              <option value="p">Paragraph</option>
              <option value="h2">Subsection (1.1)</option>
              <option value="h3">Sub-subsection (1.1.1)</option>
            </select>
            <Sep />
          </>
        )}
        <Btn title="Bold (Ctrl+B)" active={s.bold} disabled={s.inCode} onClick={() => chain().toggleBold().run()}>
          <Bold size={16} />
        </Btn>
        <Btn title="Italic (Ctrl+I)" active={s.italic} disabled={s.inCode} onClick={() => chain().toggleItalic().run()}>
          <Italic size={16} />
        </Btn>
        <Btn title="Inline code / file name" active={s.code} disabled={s.inCode} onClick={() => chain().toggleCode().run()}>
          <Code size={16} />
        </Btn>
        <Btn
          title="Link"
          active={s.link}
          disabled={s.inCode}
          onClick={() => {
            setHref(editor.getAttributes("link").href ?? "");
            setPanel(panel === "link" ? null : "link");
          }}
        >
          <Link2 size={16} />
        </Btn>
        <Sep />
        <Btn title="Bullet list" active={s.bullet} disabled={s.inCode || s.inTable} onClick={() => chain().toggleBulletList().run()}>
          <List size={16} />
        </Btn>
        <Btn title="Numbered list" active={s.ordered} disabled={s.inCode || s.inTable} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </Btn>
        <Sep />
        <Btn title="Insert figure (image)" disabled={uploading || s.inTable || s.inCode} onClick={() => fileInput.current?.click()}>
          <ImagePlus size={16} />
          <span className="hidden text-xs lg:inline">{uploading ? "Uploading…" : "Figure"}</span>
        </Btn>
        <Btn
          title="Insert table"
          disabled={s.inTable || s.inCode}
          onClick={() =>
            chain()
              .insertTable({ rows: 3, cols: 2, withHeaderRow: true })
              .updateAttributes("table", {
                refId: newRefId(),
                caption: "",
                columns: [
                  { align: "left", width: 4.2 },
                  { align: "left", width: null },
                ],
              })
              .run()
          }
        >
          <Table2 size={16} />
          <span className="hidden text-xs lg:inline">Table</span>
        </Btn>
        <Btn
          title="Insert code listing"
          disabled={s.inTable || s.inCode}
          onClick={() =>
            chain()
              .insertContent({ type: "codeBlock", attrs: { language: "python", caption: "", refId: newRefId() } })
              .run()
          }
        >
          <FileCode2 size={16} />
          <span className="hidden text-xs lg:inline">Code</span>
        </Btn>
        <Btn title="Page break" disabled={s.inTable || s.inCode} onClick={() => chain().insertContent({ type: "pageBreak" }).run()}>
          <Scissors size={16} />
        </Btn>
        <Sep />
        <Btn
          title="Insert the project name (printed in bold)"
          disabled={s.inCode}
          onClick={() => chain().insertContent({ type: "projectName", attrs: { name: env.projectName } }).run()}
        >
          <Tag size={16} />
          <span className="hidden text-xs lg:inline">Name</span>
        </Btn>
        <Btn title="Reference a figure, table or listing" disabled={s.inCode} onClick={() => setPanel(panel === "ref" ? null : "ref")}>
          <Hash size={16} />
          <span className="hidden text-xs lg:inline">Reference</span>
        </Btn>
        <Sep />
        <Btn title="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 size={16} />
        </Btn>
        <Btn title="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 size={16} />
        </Btn>
      </div>

      {panel === "link" && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm">
          <input
            autoFocus
            className="input flex-1"
            placeholder="https://example.com"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyLink();
              if (e.key === "Escape") setPanel(null);
            }}
          />
          <button className="btn btn-primary" onClick={applyLink}>
            {href.trim() ? "Apply" : "Remove link"}
          </button>
          <button className="btn" onClick={() => setPanel(null)}>
            Cancel
          </button>
        </div>
      )}

      {panel === "ref" && (
        <div className="max-h-72 overflow-auto border-t border-slate-100 px-3 py-2 text-sm">
          {env.refTargets.length === 0 && (
            <p className="text-slate-500">
              Nothing to reference yet. Figures, tables and code listings with a caption can be referenced.
            </p>
          )}
          {groups.map(([label, items]) =>
            items.length ? (
              <div key={label} className="mb-2">
                <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{label}s</div>
                {items.map((t) => (
                  <button
                    key={t.refId}
                    className="block w-full truncate rounded px-2 py-1 text-left hover:bg-blue-50"
                    onClick={() => {
                      chain().insertContent({ type: "crossRef", attrs: { refId: t.refId } }).run();
                      setPanel(null);
                    }}
                  >
                    <span className="text-slate-400">{t.sectionTitle} · </span>
                    {t.caption || <em className="text-slate-400">(no caption)</em>}
                  </button>
                ))}
              </div>
            ) : null,
          )}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          void insertFigure(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Upload errors are shown with a toast-like element instead of alert(). */
function alertInline(message: string) {
  const el = document.createElement("div");
  el.className = "toast toast-error";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}
