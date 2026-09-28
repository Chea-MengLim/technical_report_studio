"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";

export function SubmitButton({ submit }: { submit: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm)
    return (
      <button className="btn" onClick={() => setConfirm(true)}>
        <Send size={15} /> Submit for review
      </button>
    );
  return (
    <span className="flex items-center gap-2 text-sm">
      Tell the administrator this report is ready?
      <button className="btn btn-primary" disabled={pending} onClick={() => start(() => submit())}>
        Submit
      </button>
      <button className="btn" onClick={() => setConfirm(false)}>
        Cancel
      </button>
    </span>
  );
}
