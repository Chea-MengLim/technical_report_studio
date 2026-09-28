"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { History, Settings2 } from "lucide-react";
import { updateSectionMeta } from "@/app/actions/sections";

type Kind = "FRONT" | "BODY" | "APPENDIX";

export function SectionSettings(props: {
  sectionId: string;
  kind: Kind;
  newPage: boolean;
  special: string | null;
  historyHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(props.kind);
  const [newPage, setNewPage] = useState(props.newPage);
  const [pending, start] = useTransition();

  const save = (patch: { kind?: Kind; newPage?: boolean }) =>
    start(() => updateSectionMeta(props.sectionId, patch));

  return (
    <div className="relative flex items-center gap-1">
      <Link href={props.historyHref} className="btn" title="Earlier versions of this section">
        <History size={15} /> History
      </Link>
      <button className="btn" onClick={() => setOpen(!open)} title="Section settings" aria-label="Section settings">
        <Settings2 size={15} />
      </button>
      {open && (
        <div className="absolute top-10 right-0 z-30 w-72 rounded-md border border-slate-200 bg-white p-4 text-sm shadow-lg">
          <label className="label">Part of the report</label>
          <select
            className="input w-full"
            value={kind}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value as Kind;
              setKind(v);
              save({ kind: v });
            }}
          >
            <option value="FRONT">Front matter (before the contents)</option>
            <option value="BODY">Chapter (numbered I, II, III …)</option>
            <option value="APPENDIX">Appendix (after the references)</option>
          </select>
          <label className="mt-3 flex items-center gap-2">
            <input
              type="checkbox"
              checked={newPage}
              disabled={pending}
              onChange={(e) => {
                setNewPage(e.target.checked);
                save({ newPage: e.target.checked });
              }}
            />
            Start on a new page
          </label>
          {props.special === "contributors" && (
            <p className="hint mt-3">
              The team member list (from “Team members”) is printed after the text of this section.
            </p>
          )}
          <p className="hint mt-3">Section titles are printed in capitals in the PDF.</p>
        </div>
      )}
    </div>
  );
}
