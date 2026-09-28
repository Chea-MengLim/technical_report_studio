import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireProjectBySlug } from "@/lib/auth";
import { sectionOutline } from "@/lib/queries";
import { ProjectSidebar } from "@/components/ProjectSidebar";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[slug]">) {
  const { slug } = await params;
  const { project } = await requireProjectBySlug(slug);
  const sections = await sectionOutline(project.id);
  const refs = await db.select({ id: schema.references.id }).from(schema.references).where(eq(schema.references.projectId, project.id)).limit(1);
  return (
    <>
      <ProjectSidebar
        project={{ id: project.id, slug: project.slug, name: project.name }}
        hasReferences={refs.length > 0}
        sections={sections.map((s) => ({
          id: s.id,
          title: s.title,
          kind: s.kind,
          lockedBy: s.lockedBy,
        }))}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </>
  );
}
