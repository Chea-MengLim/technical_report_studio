"use client";

import { useActionState } from "react";
import { changeOwnPassword } from "@/app/actions/auth";

export function PasswordForm() {
  const [message, action, pending] = useActionState(changeOwnPassword, null);
  return (
    <form action={action} className="card mt-3 space-y-4 p-5">
      <div>
        <label className="label">Current password</label>
        <input name="current" type="password" className="input w-full" required autoComplete="current-password" />
      </div>
      <div>
        <label className="label">New password</label>
        <input name="next" type="password" minLength={8} className="input w-full" required autoComplete="new-password" />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          Change password
        </button>
        {message && (
          <span className={`text-sm ${message === "Password changed." ? "text-emerald-700" : "text-red-700"}`}>{message}</span>
        )}
      </div>
    </form>
  );
}
