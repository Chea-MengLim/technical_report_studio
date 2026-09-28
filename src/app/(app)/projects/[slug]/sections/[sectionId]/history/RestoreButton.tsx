"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreRevision } from "@/app/actions/sections";

export function RestoreButton({ revisionId }: { revisionId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-red-700">{error}</span>}
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await restoreRevision(revisionId);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not restore");
            }
          })
        }
      >
        Restore this version
      </button>
    </span>
  );
}
