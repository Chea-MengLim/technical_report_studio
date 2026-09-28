"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { saveReferences } from "@/app/actions/projects";

type Ref = { text: string; url: string };

export function ReferencesEditor({ projectId, initial }: { projectId: string; initial: Ref[] }) {
  const [refs, setRefs] = useState<Ref[]>(initial.length ? initial : [{ text: "", url: "" }]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = JSON.stringify(refs) !== JSON.stringify(initial);

  const update = (i: number, patch: Partial<Ref>) => setRefs(refs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => {
    const next = [...refs];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setRefs(next);
  };

  return (
    <div className="mt-6 space-y-3">
      {refs.map((r, i) => (
        <div key={i} className="card flex items-start gap-3 p-3">
          <span className="mt-1.5 w-6 text-right text-sm text-slate-400">[{i + 1}]</span>
          <div className="grid flex-1 gap-2 sm:grid-cols-2">
            <input
              className="input"
              placeholder="Description, e.g. Embedding Database"
              value={r.text}
              onChange={(e) => update(i, { text: e.target.value })}
            />
            <input
              className="input"
              placeholder="https://…"
              value={r.url}
              onChange={(e) => update(i, { url: e.target.value })}
            />
          </div>
          <div className="flex items-center">
            <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
              <ArrowUp size={14} />
            </button>
            <button className="icon-btn" disabled={i === refs.length - 1} onClick={() => move(i, 1)} title="Move down">
              <ArrowDown size={14} />
            </button>
            <button className="icon-btn text-red-600" onClick={() => setRefs(refs.filter((_, j) => j !== i))} title="Remove">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button className="btn" onClick={() => setRefs([...refs, { text: "", url: "" }])}>
          <Plus size={15} /> Add reference
        </button>
        <button
          className="btn btn-primary"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              try {
                await saveReferences(projectId, refs);
                setMessage("Saved.");
                router.refresh();
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Could not save");
              }
            })
          }
        >
          {pending ? "Saving…" : "Save references"}
        </button>
        {message && <span className={`text-sm ${message === "Saved." ? "text-emerald-700" : "text-red-700"}`}>{message}</span>}
      </div>
    </div>
  );
}
