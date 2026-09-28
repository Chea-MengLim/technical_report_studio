import { requireProjectBySlug } from "@/lib/auth";
import { recentBuilds } from "@/lib/queries";
import { buildProject, submitProject } from "@/app/actions/projects";
import { BuildPanel } from "@/components/BuildPanel";
import { toBuildRows } from "@/lib/build-rows";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "./SubmitButton";

export default async function ProjectOverview({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const { project } = await requireProjectBySlug(slug);
  const builds = toBuildRows(await recentBuilds({ projectId: project.id, kind: "PROJECT" }));
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <StatusBadge status={project.status} />
        <div className="ml-auto">
          {(project.status === "DRAFT" || project.status === "RETURNED") && (
            <SubmitButton submit={submitProject.bind(null, project.id)} />
          )}
        </div>
      </div>
      {project.status === "RETURNED" && project.reviewComment && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <strong>Feedback from the administrator:</strong> {project.reviewComment}
        </div>
      )}
      {project.status === "SUBMITTED" && (
        <p className="text-sm text-slate-600">
          Submitted. You can keep editing until the administrator approves it for the book.
        </p>
      )}
      <p className="text-sm text-slate-500">
        Pick a section on the left to write. Build the PDF to see the typeset report; the layout is the same as in the
        final book.
      </p>
      <BuildPanel builds={builds} start={buildProject.bind(null, project.id)} />
    </main>
  );
}
