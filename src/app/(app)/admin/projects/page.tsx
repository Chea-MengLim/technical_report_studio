import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { StatusBadge } from "@/components/StatusBadge";
import { CreateProjectForm, MembersEditor, ReviewActions } from "./ProjectAdmin";

export const metadata = { title: "Manage projects" };

export default async function AdminProjectsPage() {
  const projects = await db
    .select()
    .from(schema.projects)
    .orderBy(asc(schema.projects.bookOrder), asc(schema.projects.name));
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role })
    .from(schema.users)
    .orderBy(asc(schema.users.name));
  const members = await db.select().from(schema.projectMembers);

  return (
    <main className="p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Manage projects</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a project for each team, assign its editors, and approve it when it is ready for the book.
        </p>
        <div className="mt-6 space-y-3">
          {projects.map((p) => (
            <div key={p.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/projects/${p.slug}`} className="text-lg font-semibold hover:underline">
                  {p.name}
                </Link>
                <span className="text-sm text-slate-400">/{p.slug}</span>
                <StatusBadge status={p.status} />
                <div className="ml-auto">
                  <ReviewActions projectId={p.id} status={p.status} name={p.name} />
                </div>
              </div>
              {p.reviewComment && p.status === "RETURNED" && (
                <p className="mt-2 text-sm text-red-800">Feedback: {p.reviewComment}</p>
              )}
              <MembersEditor
                projectId={p.id}
                users={users.filter((u) => u.role === "EDITOR")}
                selected={members.filter((m) => m.projectId === p.id).map((m) => m.userId)}
              />
            </div>
          ))}
        </div>
        <h2 className="mt-8 text-lg font-semibold">New project</h2>
        <CreateProjectForm />
      </div>
    </main>
  );
}
