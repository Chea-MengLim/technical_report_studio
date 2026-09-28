import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBook } from "@/lib/latex/build";
import { SectionEditor } from "@/components/editor/SectionEditor";

export const metadata = { title: "Preface" };

export default async function PrefacePage() {
  const book = await getBook();
  const [section] = await db.select().from(schema.sections).where(eq(schema.sections.id, book.prefaceSectionId!));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SectionEditor
        section={{ id: section.id, title: section.title, content: section.content, version: section.version }}
        projectId={null}
        projectName={book.title}
        otherTargets={[]}
        isAdmin
      />
    </div>
  );
}
