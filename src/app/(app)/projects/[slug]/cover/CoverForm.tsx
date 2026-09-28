"use client";

import { useActionState } from "react";
import type { Project } from "@/db/schema";
import { updateProjectSettings } from "@/app/actions/projects";

export function CoverForm({ project }: { project: Project }) {
  const [message, action, pending] = useActionState(updateProjectSettings.bind(null, project.id), null);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Project name</label>
          <input id="name" name="name" className="input w-full" defaultValue={project.name} required />
          <p className="hint">Printed in bold wherever the text uses the project name chip.</p>
        </div>
        <div>
          <label className="label" htmlFor="reportType">Report type</label>
          <input id="reportType" name="reportType" className="input w-full" defaultValue={project.reportType} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="tagline">Tagline</label>
        <input id="tagline" name="tagline" className="input w-full" defaultValue={project.tagline} />
        <p className="hint">Second line of the title, e.g. “Simplified data amplifies insight”.</p>
      </div>
      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={3} className="input w-full" defaultValue={project.description} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="footerName">Footer text</label>
          <input id="footerName" name="footerName" className="input w-full" defaultValue={project.footerName} />
          <p className="hint">Bottom-left of every page, e.g. “SQLyst Web Application”.</p>
        </div>
        <div>
          <label className="label" htmlFor="teamName">Team name on the profile page</label>
          <input id="teamName" name="teamName" className="input w-full" defaultValue={project.teamName} placeholder={project.name} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {message && <span className={`text-sm ${message === "Saved." ? "text-emerald-700" : "text-red-700"}`}>{message}</span>}
      </div>
    </form>
  );
}
