import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireProjectBySlug } from "@/lib/auth";
import { TeamEditor } from "./TeamEditor";

export default async function TeamPage({ params }: PageProps<"/projects/[slug]/team">) {
  const { slug } = await params;
  const { project } = await requireProjectBySlug(slug);
  const people = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.projectId, project.id))
    .orderBy(asc(schema.people.order));
  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold">Team members</h1>
        <p className="mt-1 text-sm text-slate-500">
          Used for the profile page (photos, names and roles) and the contributors page (names, roles and emails). The
          order here is the order in the report.
        </p>
        <TeamEditor
          projectId={project.id}
          people={people.map((p) => ({
            id: p.id,
            name: p.name,
            role: p.role,
            email: p.email,
            photoAssetId: p.photoAssetId,
          }))}
        />
      </div>
    </main>
  );
}
