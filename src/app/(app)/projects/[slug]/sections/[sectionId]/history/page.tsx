import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireProjectBySlug } from "@/lib/auth";
import { plainText } from "@/lib/doc";
import { RestoreButton } from "./RestoreButton";

export default async function HistoryPage({ params }: PageProps<"/projects/[slug]/sections/[sectionId]/history">) {
  const { slug, sectionId } = await params;
  const { project } = await requireProjectBySlug(slug);
  if (!/^[0-9a-f-]{36}$/.test(sectionId)) notFound();
  const [section] = await db
    .select()
    .from(schema.sections)
    .where(and(eq(schema.sections.id, sectionId), eq(schema.sections.projectId, project.id)));
  if (!section) notFound();
  const revisions = await db
    .select({
      id: schema.sectionRevisions.id,
      title: schema.sectionRevisions.title,
      content: schema.sectionRevisions.content,
      updatedAt: schema.sectionRevisions.updatedAt,
      author: schema.users.name,
    })
    .from(schema.sectionRevisions)
    .leftJoin(schema.users, eq(schema.users.id, schema.sectionRevisions.authorId))
    .where(eq(schema.sectionRevisions.sectionId, sectionId))
    .orderBy(desc(schema.sectionRevisions.updatedAt))
    .limit(100);

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl">
        <Link href={`/projects/${slug}/sections/${sectionId}`} className="text-sm text-blue-700 hover:underline">
          ← Back to “{section.title}”
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">History</h1>
        <p className="mt-1 text-sm text-slate-500">
          A version is kept for every 10 minutes of editing. Restoring replaces the current text; the current text
          stays in the history.
        </p>
        <ul className="mt-6 space-y-3">
          {revisions.map((r, i) => {
            const text = plainText(r.content);
            return (
              <li key={r.id} className="card p-4">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">{r.updatedAt.toLocaleString()}</span>
                  <span className="text-slate-500">{r.author ?? "Imported"}</span>
                  <span className="text-slate-400">{text.split(/\s+/).filter(Boolean).length} words</span>
                  <span className="ml-auto">
                    {i === 0 ? <span className="text-slate-400">Latest</span> : <RestoreButton revisionId={r.id} />}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                  <strong>{r.title}.</strong> {text.slice(0, 400)}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
