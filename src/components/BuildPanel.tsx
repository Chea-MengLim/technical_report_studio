"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileArchive, Loader2, Play, RefreshCw } from "lucide-react";
import { getBuildStatus } from "@/app/actions/projects";
import type { BuildRow } from "@/lib/build-rows";


const STATUS: Record<BuildRow["status"], string> = {
  QUEUED: "text-slate-600",
  RUNNING: "text-blue-700",
  SUCCESS: "text-emerald-700",
  FAILED: "text-red-700",
};

export function BuildPanel({
  builds,
  start,
  label = "Build PDF",
}: {
  builds: BuildRow[];
  start: () => Promise<string>;
  label?: string;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = builds.find((b) => b.status === "QUEUED" || b.status === "RUNNING");
  const latest = builds[0];
  const lastGood = builds.find((b) => b.status === "SUCCESS");
  const [shown, setShown] = useState<string | null>(null);
  const viewing = builds.find((b) => b.id === shown) ?? lastGood;

  // Poll the running build and refresh the page when it finishes.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const status = await getBuildStatus(running.id).catch(() => null);
      if (status !== "QUEUED" && status !== "RUNNING") {
        setShown(null);
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [running, router]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={!!running || starting}
          onClick={async () => {
            setStarting(true);
            setError(null);
            try {
              await start();
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not start the build");
            } finally {
              setStarting(false);
            }
          }}
        >
          {running || starting ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          {running ? (running.status === "QUEUED" ? "Waiting…" : "Building… (about a minute)") : label}
        </button>
        {viewing?.hasPdf && (
          <a className="btn" href={`/api/builds/${viewing.id}/pdf`} target="_blank" rel="noreferrer">
            <Download size={15} /> Open PDF
          </a>
        )}
        {viewing?.hasZip && (
          <a className="btn" href={`/api/builds/${viewing.id}/zip`}>
            <FileArchive size={15} /> LaTeX source (.zip)
          </a>
        )}
        {latest && !running && (
          <span className={`text-sm ${STATUS[latest.status]}`}>
            Last build {latest.status === "SUCCESS" ? "succeeded" : "failed"} ·{" "}
            {new Date(latest.createdAt).toLocaleString()}
            {latest.pages ? ` · ${latest.pages} pages` : ""}
          </span>
        )}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>

      {latest?.status === "FAILED" && latest.log && (
        <details open className="rounded border border-red-200 bg-red-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-red-800">
            The PDF could not be built. Show details
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-red-900">{latest.log}</pre>
        </details>
      )}
      {viewing?.log?.startsWith("Content warnings") && viewing.status === "SUCCESS" && (
        <details className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-amber-800">Content warnings in this build</summary>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-amber-900">
            {viewing.log.split("\n\nLaTeX errors")[0].split("\n\nLog (last lines)")[0]}
          </pre>
        </details>
      )}

      {viewing?.hasPdf ? (
        <iframe
          key={viewing.id}
          title="PDF preview"
          src={`/api/builds/${viewing.id}/pdf`}
          className="min-h-[70vh] w-full flex-1 rounded border border-slate-300 bg-slate-200"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center rounded border-2 border-dashed border-slate-300 p-10 text-sm text-slate-500">
          No PDF yet. Click “{label}” to typeset the document.
        </div>
      )}

      {builds.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">
            <RefreshCw size={12} className="mr-1 inline" /> Earlier builds
          </summary>
          <ul className="mt-2 space-y-1">
            {builds.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                <span className={`w-20 ${STATUS[b.status]}`}>{b.status.toLowerCase()}</span>
                <span className="text-slate-500">{new Date(b.createdAt).toLocaleString()}</span>
                {b.pages && <span className="text-slate-500">{b.pages} pages</span>}
                {b.hasPdf && (
                  <button className="text-blue-700 underline" onClick={() => setShown(b.id)}>
                    view
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
