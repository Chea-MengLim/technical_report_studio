import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { getBook } from "@/lib/latex/build";
import { recentBuilds } from "@/lib/queries";
import { toBuildRows } from "@/lib/build-rows";
import { buildBook, setInstitutionLogo } from "@/app/actions/admin";
import { BuildPanel } from "@/components/BuildPanel";
import { ImageUploadField } from "@/components/ImageUploadField";
import { BookSettingsForm, ProjectOrder } from "./BookForms";

export const metadata = { title: "Book" };

export default async function BookPage() {
  const book = await getBook();
  const projects = await db
    .select({ id: schema.projects.id, name: schema.projects.name, status: schema.projects.status })
    .from(schema.projects)
    .orderBy(asc(schema.projects.bookOrder), asc(schema.projects.name));
  const builds = toBuildRows(await recentBuilds({ kind: "BOOK" }));
  const included = book.approvedOnly ? projects.filter((p) => p.status === "APPROVED") : projects;

  return (
    <main className="p-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Book</h1>
          <p className="mt-1 text-sm text-slate-500">
            The merged book: cover, preface, one table of contents, then every project with its own cover, profile,
            chapters, references and appendices. Numbering restarts for each project.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card space-y-5 p-5">
            <h2 className="font-semibold">Cover and settings</h2>
            <BookSettingsForm book={book} />
            <div>
              <span className="label">Institution logo (book cover and every project cover)</span>
              <ImageUploadField assetId={book.institutionLogoAssetId} projectId={null} save={setInstitutionLogo} />
            </div>
          </section>

          <section className="space-y-6">
            <div className="card p-5">
              <h2 className="font-semibold">Preface</h2>
              <p className="mt-1 text-sm text-slate-500">Printed after the book cover, before the table of contents.</p>
              <Link href="/admin/book/preface" className="btn mt-3">
                Edit preface
              </Link>
            </div>
            <div className="card p-5">
              <h2 className="font-semibold">Order of the projects</h2>
              <p className="mt-1 text-sm text-slate-500">
                {book.approvedOnly
                  ? `Only approved projects are included (${included.length} of ${projects.length}).`
                  : `All ${projects.length} projects are included.`}
              </p>
              <ProjectOrder projects={projects} approvedOnly={book.approvedOnly} />
            </div>
          </section>
        </div>

        <section className="card flex min-h-[80vh] flex-col p-5">
          <h2 className="mb-3 font-semibold">Build the book</h2>
          {included.length === 0 ? (
            <p className="text-sm text-slate-500">
              No project is included yet. Approve projects on “Manage projects”, or include unapproved projects in the
              settings.
            </p>
          ) : (
            <BuildPanel builds={builds} start={buildBook} label="Build book PDF" />
          )}
        </section>
      </div>
    </main>
  );
}
