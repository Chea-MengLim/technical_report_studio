import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireProjectBySlug } from "@/lib/auth";
import { ReferencesEditor } from "./ReferencesEditor";

export default async function ReferencesPage({ params }: PageProps<"/projects/[slug]/references">) {
  const { slug } = await params;
  const { project } = await requireProjectBySlug(slug);
  const refs = await db
    .select()
    .from(schema.references)
    .where(eq(schema.references.projectId, project.id))
    .orderBy(asc(schema.references.order));
  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold">References</h1>
        <p className="mt-1 text-sm text-slate-500">
          Printed as a numbered list in the REFERENCES chapter, after the last chapter and before the appendices.
        </p>
        <ReferencesEditor projectId={project.id} initial={refs.map((r) => ({ text: r.text, url: r.url }))} />
      </div>
    </main>
  );
}
