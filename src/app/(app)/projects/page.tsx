import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { projectsForUser } from "@/lib/queries";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await projectsForUser(user);
  return (
    <main className="flex-1 overflow-auto p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-slate-500">
          Each project is one chapter of the book. Write the content; the layout is applied when the PDF is built.
        </p>
        {projects.length === 0 ? (
          <div className="card mt-6 p-6 text-sm text-slate-600">
            You are not assigned to a project yet. Ask the administrator to add you to your team&apos;s project.
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.slug}`} className="card block p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold">{p.name}</h2>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.tagline || p.description || "No description yet."}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
