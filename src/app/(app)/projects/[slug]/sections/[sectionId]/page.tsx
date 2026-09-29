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
    .select({ id: schema.sections.id, title: schema.sections.title, content: schema.sections.content, kind: schema.sections.kind })
    .from(schema.sections)
    .where(eq(schema.sections.projectId, project.id))
    .orderBy(asc(schema.sections.order));
  const otherTargets = collectRefTargets(others.filter((s) => s.id !== section.id));

  // Chapter number as printed: chapters 1, 2 ..., then References, then appendices.
  const [ref] = await db
    .select({ id: schema.references.id })
    .from(schema.references)
    .where(eq(schema.references.projectId, project.id))
    .limit(1);
  const ofKind = (k: string) => others.filter((s) => s.kind === k);
  const chapter =
    section.kind === "BODY"
      ? ofKind("BODY").findIndex((s) => s.id === section.id) + 1
      : section.kind === "APPENDIX"
        ? ofKind("BODY").length + (ref ? 1 : 0) + ofKind("APPENDIX").findIndex((s) => s.id === section.id) + 1
        : null;

  return (
    <SectionEditor
      key={section.id}
      section={{ id: section.id, title: section.title, content: section.content, version: section.version }}
      projectId={project.id}
      projectName={project.name}
      otherTargets={otherTargets}
      isAdmin={user.role === "ADMIN"}
      chapter={chapter}
      headerExtra={
        <SectionSettings
          key="settings"
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
