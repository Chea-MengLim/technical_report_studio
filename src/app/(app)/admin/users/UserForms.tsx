"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser, deleteUser, resetPassword, setUserRole } from "@/app/actions/admin";

export function CreateUserForm({ projects }: { projects: { id: string; name: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [error, action, pending] = useActionState(async (prev: string | null, data: FormData) => {
    const res = await createUser(prev, data);
    if (!res) form.current?.reset();
    return res;
  }, null);
  return (
    <form ref={form} action={action} className="card mt-3 grid gap-4 p-5 sm:grid-cols-2">
      <div>
        <label className="label">Name</label>
        <input name="name" className="input w-full" required />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" className="input w-full" required />
      </div>
      <div>
        <label className="label">Initial password</label>
        <input name="password" type="text" minLength={8} className="input w-full" required />
        <p className="hint">Share it with the user; they can change it under their name (top right).</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Role</label>
          <select name="role" className="input w-full" defaultValue="EDITOR">
            <option value="EDITOR">Editor</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div>
          <label className="label">Project</label>
          <select name="projectId" className="input w-full" defaultValue="">
            <option value="">(none)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>
          Create user
        </button>
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </form>
  );
}

export function UserRowActions({ userId, role }: { userId: string; role: "ADMIN" | "EDITOR" }) {
  const [mode, setMode] = useState<null | "password" | "delete">(null);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, done: string) =>
    start(async () => {
      try {
        await fn();
        setMsg(done);
        setMode(null);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Failed");
      }
    });

  if (mode === "password")
    return (
      <span className="flex items-center justify-end gap-2">
        <input
          className="input w-40"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn btn-primary" disabled={pending} onClick={() => run(() => resetPassword(userId, password), "Password set.")}>
          Set
        </button>
        <button className="btn" onClick={() => setMode(null)}>Cancel</button>
      </span>
    );
  if (mode === "delete")
    return (
      <span className="flex items-center justify-end gap-2">
        Delete this user?
        <button className="btn btn-danger" disabled={pending} onClick={() => run(() => deleteUser(userId), "Deleted.")}>
          Delete
        </button>
        <button className="btn" onClick={() => setMode(null)}>Cancel</button>
      </span>
    );
  return (
    <span className="flex items-center justify-end gap-2">
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
      <button
        className="btn"
        disabled={pending}
        onClick={() => run(() => setUserRole(userId, role === "ADMIN" ? "EDITOR" : "ADMIN"), "Role changed.")}
      >
        Make {role === "ADMIN" ? "editor" : "admin"}
      </button>
      <button className="btn" onClick={() => setMode("password")}>Reset password</button>
      <button className="btn btn-danger" onClick={() => setMode("delete")}>Delete</button>
    </span>
  );
}
