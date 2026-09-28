"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { AlertTriangle, CheckCircle2, Loader2, Lock } from "lucide-react";
import { collectRefTargets, type DocNode, type RefTarget } from "@/lib/doc";
import { collectRefKinds, serializeDoc } from "@/lib/latex/serialize";
import { acquireLock, forceUnlock, releaseLock, saveSection } from "@/app/actions/sections";
import { editorExtensions } from "./extensions";
import { EditorEnvContext, uploadAsset, type EditorEnv } from "./context";
import { Toolbar } from "./Toolbar";
import { TablePanel } from "./TablePanel";

export interface EditorSection {
  id: string;
  title: string;
  content: DocNode;
  version: number;
}

interface Props {
  section: EditorSection;
  projectId: string | null;
  projectName: string;
  /** Referenceable blocks of the other sections of the project. */
  otherTargets: RefTarget[];
  isAdmin: boolean;
  /** Extra controls rendered next to the title (section settings). */
  headerExtra?: React.ReactNode;
}

type LockState = { status: "acquiring" } | { status: "editing" } | { status: "locked"; by: string };
type SaveState = "saved" | "dirty" | "saving" | "error";

const HEARTBEAT_MS = 30_000;
const AUTOSAVE_MS = 1_200;

/** Problems that would show up in the PDF, found by running the LaTeX serializer. */
function checkDoc(doc: DocNode, targets: RefTarget[]): string[] {
  const warnings: string[] = [];
  const kinds = collectRefKinds([doc]);
  for (const t of targets) if (!kinds.has(t.refId)) kinds.set(t.refId, t.kind);
  serializeDoc({ slug: "check", assetPath: () => "x", refKinds: kinds, warnings, usedLabels: new Set() }, doc);
  return [...new Set(warnings)];
}

export function SectionEditor({ section, projectId, projectName, otherTargets, isAdmin, headerExtra }: Props) {
  const [lock, setLock] = useState<LockState>({ status: "acquiring" });
  const [save, setSave] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(section.title);
  const [liveDoc, setLiveDoc] = useState<DocNode>(section.content);

  const version = useRef(section.version);
  const titleRef = useRef(section.title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const pending = useRef(false);
  const baseline = useRef<string | null>(null);

  const editor = useEditor({
    extensions: editorExtensions(),
    content: section.content,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "report-content" } },
    // Tiptap normalises the stored document when it loads (default attributes,
    // trailing paragraph); that is not an edit, so compare with this baseline.
    onCreate: ({ editor: e }) => {
      baseline.current = JSON.stringify(e.getJSON());
    },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON() as DocNode;
      setLiveDoc(json);
      if (JSON.stringify(json) === baseline.current) return;
      baseline.current = null;
      scheduleSave();
    },
  });

  const flush = useCallback(async () => {
    if (!editor) return;
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    // Save, and save again if more edits arrived while the request was running.
    const run = async () => {
      do {
        pending.current = false;
        setSave("saving");
        // ProseMirror keeps node attributes in null-prototype objects, which the
        // server action serializer drops silently: send plain JSON instead.
        const content = JSON.parse(JSON.stringify(editor.getJSON())) as DocNode;
        const res = await saveSection(section.id, { title: titleRef.current, content }, version.current).catch((e: Error) => ({ ok: false as const, reason: "error" as const, message: e.message }));
        if (!res.ok) {
          setSave("error");
          setError(res.message);
          if (res.reason !== "error") {
            editor.setEditable(false);
            setLock({ status: "locked", by: "another session" });
          }
          return;
        }
        version.current = res.version;
        setError(null);
      } while (pending.current);
      setSave("saved");
    };
    inFlight.current = run().finally(() => {
      inFlight.current = null;
    });
    await inFlight.current;
  }, [editor, section.id]);

  const scheduleSave = useCallback(() => {
    setSave("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, AUTOSAVE_MS);
  }, [flush]);

  // Take the lock, keep it alive, give it back when leaving.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    let holding = false;
    const take = async () => {
      const res = await acquireLock(section.id).catch(() => null);
      if (cancelled || !res) return;
      if (res.ok) {
        if (!holding && res.version !== version.current) {
          // Someone saved since this page was loaded: reload to get their text.
          window.location.reload();
          return;
        }
        holding = true;
        editor.setEditable(true);
        setLock({ status: "editing" });
      } else {
        holding = false;
        editor.setEditable(false);
        setLock({ status: "locked", by: res.lockedBy });
      }
    };
    void take();
    const beat = setInterval(take, HEARTBEAT_MS);
    const unlock = () => {
      // Unsaved edits (autosave not fired yet): send them with keepalive, which
      // survives the page closing. Browsers cap keepalive bodies at 64 kB.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        const body = JSON.stringify({ title: titleRef.current, content: editor.getJSON(), version: version.current });
        if (body.length < 60_000) {
          void fetch(`/api/sections/${section.id}/save`, {
            method: "POST",
            keepalive: true,
            headers: { "content-type": "application/json" },
            body,
          }).finally(() => navigator.sendBeacon(`/api/sections/${section.id}/unlock`));
          return;
        }
      }
      navigator.sendBeacon(`/api/sections/${section.id}/unlock`);
    };
    const warn = (e: BeforeUnloadEvent) => {
      // Small pending edits are sent on pagehide; only very large ones need a prompt.
      if (timer.current && JSON.stringify(editor.getJSON()).length >= 60_000) e.preventDefault();
    };
    window.addEventListener("pagehide", unlock);
    window.addEventListener("beforeunload", warn);
    return () => {
      cancelled = true;
      clearInterval(beat);
      window.removeEventListener("pagehide", unlock);
      window.removeEventListener("beforeunload", warn);
      const done = timer.current ? (clearTimeout(timer.current), flush()) : Promise.resolve();
      void done.then(() => releaseLock(section.id)).catch(() => {});
    };
  }, [editor, section.id, flush]);

  const refTargets = useMemo(
    () => [...collectRefTargets([{ id: section.id, title, content: liveDoc }]), ...otherTargets],
    [liveDoc, otherTargets, section.id, title],
  );
  const warnings = useMemo(() => checkDoc(liveDoc, otherTargets), [liveDoc, otherTargets]);

  const env: EditorEnv = useMemo(
    () => ({
      projectId,
      projectName,
      refTargets,
      uploadImage: (file: File) => uploadAsset(file, projectId),
    }),
    [projectId, projectName, refTargets],
  );

  return (
    <EditorEnvContext.Provider value={env}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <input
            className="min-w-0 flex-1 bg-transparent text-2xl font-semibold text-slate-900 outline-none placeholder:text-slate-300"
            value={title}
            readOnly={lock.status !== "editing"}
            placeholder="Section title"
            onChange={(e) => {
              setTitle(e.target.value);
              titleRef.current = e.target.value;
              scheduleSave();
            }}
          />
          {headerExtra}
          <SaveIndicator lock={lock} save={save} />
        </div>

        {lock.status === "locked" && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
            <Lock size={16} />
            <span className="flex-1">
              <strong>{lock.by}</strong> is editing this section. You can read it; editing unlocks when they leave.
            </span>
            {isAdmin && (
              <button
                className="btn"
                onClick={async () => {
                  await forceUnlock(section.id);
                  window.location.reload();
                }}
              >
                Force unlock
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-800">
            {error}{" "}
            <button className="underline" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
          {editor && <Toolbar editor={editor} />}
          {editor && <TablePanel editor={editor} />}
          <div className="mx-auto my-6 max-w-[860px] rounded-sm bg-white px-14 py-10 shadow-sm">
            <EditorContent editor={editor} />
          </div>
          {warnings.length > 0 && (
            <div className="mx-auto mb-10 max-w-[860px] rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <AlertTriangle size={16} /> Check before building the PDF
              </div>
              <ul className="list-disc pl-6">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </EditorEnvContext.Provider>
  );
}

function SaveIndicator({ lock, save }: { lock: LockState; save: SaveState }) {
  if (lock.status === "acquiring")
    return (
      <span className="flex items-center gap-1 text-sm text-slate-500">
        <Loader2 size={14} className="animate-spin" /> Opening…
      </span>
    );
  if (lock.status === "locked")
    return (
      <span className="flex items-center gap-1 text-sm text-amber-700">
        <Lock size={14} /> Read only
      </span>
    );
  const map: Record<SaveState, React.ReactNode> = {
    saved: (
      <>
        <CheckCircle2 size={14} className="text-emerald-600" /> Saved
      </>
    ),
    dirty: <>Unsaved changes</>,
    saving: (
      <>
        <Loader2 size={14} className="animate-spin" /> Saving…
      </>
    ),
    error: <span className="text-red-700">Not saved</span>,
  };
  return <span className="flex items-center gap-1 text-sm text-slate-500">{map[save]}</span>;
}
