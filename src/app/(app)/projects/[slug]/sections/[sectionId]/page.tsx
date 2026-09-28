import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireProjectBySlug } from "@/lib/auth";
import { collectRefTargets } from "@/lib/doc";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { SectionSettings } from "./SectionSettings";

export default async function SectionPage({ params }: PageProps<"/projects/[slug]/sections/[sectionId]">) {
  const { slug, sectionId } = await params;
  const { user, project } = await requireProjectBySlug(slug);
  if (!/^[0-9a-f-]{36}$/.test(sectionId)) notFound();
  const [section] = await db
    .select()
    .from(schema.sections)
    .where(and(eq(schema.sections.id, sectionId), eq(schema.sections.projectId, project.id)));
  if (!section) notFound();

  const others = await db
    .select({ id: schema.sections.id, title: schema.sections.title, content: schema.sections.content })
    .from(schema.sections)
    .where(eq(schema.sections.projectId, project.id))
    .orderBy(asc(schema.sections.order));
  const otherTargets = collectRefTargets(others.filter((s) => s.id !== section.id));

  return (
    <SectionEditor
      key={section.id}
      section={{ id: section.id, title: section.title, content: section.content, version: section.version }}
      projectId={project.id}
      projectName={project.name}
      otherTargets={otherTargets}
      isAdmin={user.role === "ADMIN"}
      headerExtra={
        <SectionSettings
          sectionId={section.id}
          kind={section.kind}
          newPage={section.newPage}
          special={section.special}
          historyHref={`/projects/${slug}/sections/${section.id}/history`}
        />
      }
    />
  );
}
