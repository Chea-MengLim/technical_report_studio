"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { Book } from "@/db/schema";
import { updateBook } from "@/app/actions/admin";
import { reorderBookProjects } from "@/app/actions/projects";
import { StatusBadge } from "@/components/StatusBadge";

export function BookSettingsForm({ book }: { book: Book }) {
  const [message, action, pending] = useActionState(updateBook, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label">Title</label>
        <input name="title" className="input w-full" defaultValue={book.title} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Label above the title</label>
          <input name="subtitle" className="input w-full" defaultValue={book.subtitle} placeholder="PROJECT REPORTS" />
        </div>
        <div>
          <label className="label">Academic year</label>
          <input name="academicYear" className="input w-full" defaultValue={book.academicYear} />
        </div>
      </div>
      <div>
        <label className="label">Description on the cover</label>
        <textarea name="description" rows={3} className="input w-full" defaultValue={book.description} />
      </div>
      <div>
        <label className="label">Copyright line</label>
        <input name="copyright" className="input w-full" defaultValue={book.copyright} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Table of contents depth</label>
          <select name="tocDepth" className="input w-full" defaultValue={String(book.tocDepth)}>
            <option value="0">Projects only</option>
            <option value="1">Projects and chapters</option>
            <option value="2">… and subsections</option>
            <option value="3">… and sub-subsections</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
          <input type="checkbox" name="approvedOnly" defaultChecked={book.approvedOnly} />
          Only include approved projects
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          Save
        </button>
        {message && <span className={`text-sm ${message === "Saved." ? "text-emerald-700" : "text-red-700"}`}>{message}</span>}
      </div>
    </form>
  );
}

export function ProjectOrder({
  projects,
  approvedOnly,
}: {
  projects: { id: string; name: string; status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED" }[];
  approvedOnly: boolean;
}) {
  const [items, setItems] = useState(projects);
  const [pending, start] = useTransition();
  const router = useRouter();
  const move = (i: number, d: number) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
    start(async () => {
      await reorderBookProjects(next.map((p) => p.id));
      router.refresh();
    });
  };
  return (
    <ol className="mt-3 space-y-1">
      {items.map((p, i) => {
        const excluded = approvedOnly && p.status !== "APPROVED";
        return (
          <li key={p.id} className={`flex items-center gap-2 rounded border border-slate-200 px-3 py-1.5 text-sm ${excluded ? "opacity-50" : ""}`}>
            <span className="w-5 text-slate-400">{i + 1}.</span>
            <span className="flex-1 font-medium">{p.name}</span>
            <StatusBadge status={p.status} />
            <button className="icon-btn" disabled={i === 0 || pending} onClick={() => move(i, -1)} title="Move up">
              <ArrowUp size={14} />
            </button>
            <button className="icon-btn" disabled={i === items.length - 1 || pending} onClick={() => move(i, 1)} title="Move down">
              <ArrowDown size={14} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
