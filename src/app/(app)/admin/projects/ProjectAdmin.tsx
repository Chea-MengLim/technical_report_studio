"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject, deleteProject, setProjectMembers, setProjectStatus } from "@/app/actions/projects";

export function CreateProjectForm() {
  const [error, action, pending] = useActionState(createProject, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const autoSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (
    <form action={action} className="card mt-3 grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className="label">Project name</label>
        <input name="name" className="input w-full" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Short id (for the web address)</label>
        <input
          name="slug"
          className="input w-full"
          value={touched ? slug : autoSlug}
          onChange={(e) => {
            setTouched(true);
            setSlug(e.target.value);
          }}
          required
        />
      </div>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create"}
      </button>
      <p className="hint sm:col-span-3">
        The project starts as a copy of the finished SQLyst report: every chapter, figure, table and reference, in
        table-of-contents order. The team replaces the text and images with their own; the project name in the text
        updates by itself. Team members, cover logo and tagline start empty.
      </p>
      {error && <p className="text-sm text-red-700 sm:col-span-3">{error}</p>}
    </form>
  );
}

export function MembersEditor({
  projectId,
  users,
  selected,
}: {
  projectId: string;
  users: { id: string; name: string; email: string }[];
  selected: string[];
}) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState(selected);
  const [pending, start] = useTransition();
  const router = useRouter();
  const names = users.filter((u) => selected.includes(u.id)).map((u) => u.name);
  return (
    <div className="mt-2 text-sm">
      <span className="text-slate-500">Editors: </span>
      {names.length ? names.join(", ") : <span className="text-slate-400">nobody yet</span>}
      <button className="ml-2 text-blue-700 hover:underline" onClick={() => setOpen(!open)}>
        {open ? "close" : "change"}
      </button>
      {open && (
        <div className="mt-2 rounded border border-slate-200 p-3">
          {users.length === 0 && <p className="text-slate-500">Create editor accounts on the Users page first.</p>}
          <div className="grid gap-1 sm:grid-cols-2">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ids.includes(u.id)}
                  onChange={(e) => setIds(e.target.checked ? [...ids, u.id] : ids.filter((i) => i !== u.id))}
                />
                {u.name} <span className="text-slate-400">{u.email}</span>
              </label>
            ))}
          </div>
          <button
            className="btn btn-primary mt-3"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setProjectMembers(projectId, ids);
                setOpen(false);
                router.refresh();
              })
            }
          >
            Save editors
          </button>
        </div>
      )}
    </div>
  );
}

export function ReviewActions({
  projectId,
  status,
  name,
}: {
  projectId: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";
  name: string;
}) {
  const [mode, setMode] = useState<null | "return" | "delete">(null);
  const [comment, setComment] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      setMode(null);
      router.refresh();
    });

  if (mode === "return")
    return (
      <div className="flex items-center gap-2">
        <input
          className="input w-72"
          placeholder="What should the team change?"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <button className="btn btn-primary" disabled={pending || !comment.trim()} onClick={() => act(() => setProjectStatus(projectId, "RETURNED", comment))}>
          Return
        </button>
        <button className="btn" onClick={() => setMode(null)}>Cancel</button>
      </div>
    );
  if (mode === "delete")
    return (
      <div className="flex items-center gap-2 text-sm">
        Type <strong>{name}</strong> to delete it and all its content:
        <input className="input w-40" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        <button className="btn btn-danger" disabled={pending || confirmName !== name} onClick={() => act(() => deleteProject(projectId))}>
          Delete
        </button>
        <button className="btn" onClick={() => setMode(null)}>Cancel</button>
      </div>
    );
  return (
    <div className="flex items-center gap-2">
      {status !== "APPROVED" && (
        <button className="btn btn-primary" disabled={pending} onClick={() => act(() => setProjectStatus(projectId, "APPROVED"))}>
          Approve for book
        </button>
      )}
      {status !== "RETURNED" && (
        <button className="btn" onClick={() => setMode("return")}>
          Return with feedback
        </button>
      )}
      {status === "APPROVED" && (
        <button className="btn" disabled={pending} onClick={() => act(() => setProjectStatus(projectId, "DRAFT"))}>
          Reopen
        </button>
      )}
      <button className="btn btn-danger" onClick={() => setMode("delete")}>
        Delete
      </button>
    </div>
  );
}
