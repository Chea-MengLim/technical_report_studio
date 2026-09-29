/**
 * One-time import of the hand-written SQLyst LaTeX report into the app.
 *
 *   npm run import:sqlyst -- [path-to-SQLyst_Report_Overleaf] [--force] [--slug=x --name=X]
 *
 * --slug/--name import the same report as another project (used to test the
 * merged book with two projects that share every label and file name).
 *
 * --force deletes an existing "sqlyst" project first. Also creates an
 * editor account (sqlyst@kshrd.local / sqlyst12345) that belongs to it.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { bootstrap } from "@/lib/bootstrap";
import { createAsset } from "@/lib/assets";
import { stripComments } from "@/lib/import/latex-to-doc";
import { importReportContent } from "@/lib/import/report-template";

const args = process.argv.slice(2);
const force = args.includes("--force");
const root = path.resolve(
  args.find((a) => !a.startsWith("--")) ?? path.join(process.cwd(), "..", "SQLyst_Report_Overleaf"),
);
const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const SLUG = opt("slug") ?? "sqlyst";
const NAME = opt("name") ?? "SQLyst";

const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

async function main() {
  if (!fs.existsSync(path.join(root, "main.tex"))) throw new Error(`No main.tex in ${root}`);
  await bootstrap();

  const [existing] = await db.select().from(schema.projects).where(eq(schema.projects.slug, SLUG));
  if (existing) {
    if (!force) throw new Error(`Project "${SLUG}" already exists. Use --force to replace it.`);
    await db.delete(schema.projects).where(eq(schema.projects.id, existing.id));
    console.log("Deleted the existing SQLyst project.");
  }

  // ---------------------------------------------------------------- cover
  const cover = stripComments(read("frontmatter/cover.tex"));
  const title = /\{\s*SQLyst:\\\\\[-1mm\]\s*([^}]+?)\s*\}/.exec(cover);
  const tagline = title?.[1].trim() ?? "";
  const description =
    /\\raggedright\s+([\s\S]*?)\s*\\end\{minipage\}/.exec(cover)?.[1].replace(/\s+/g, " ").trim() ?? "";

  const [project] = await db
    .insert(schema.projects)
    .values({
      slug: SLUG,
      name: NAME,
      tagline,
      description,
      reportType: "TECHNICAL REPORT",
      footerName: `${NAME} Web Application`,
      teamName: "",
      bookOrder: 1,
    })
    .returning();

  const upload = async (file: string, projectId: string | null) => {
    const buf = fs.readFileSync(path.join(root, file));
    return createAsset(projectId, buf, path.basename(file));
  };

  const logo = await upload("figures/fig-sqlyst-logo.png", project.id);
  await db.update(schema.projects).set({ logoAssetId: logo.id }).where(eq(schema.projects.id, project.id));

  const [bookRow] = await db.select().from(schema.book).where(eq(schema.book.id, 1));
  if (!bookRow.institutionLogoAssetId) {
    const inst = await upload("figures/fig-kshrd-logo-v2.png", null);
    await db.update(schema.book).set({ institutionLogoAssetId: inst.id }).where(eq(schema.book.id, 1));
  }

  // --------------------------------------------------------------- people
  const profile = stripComments(read("frontmatter/profile.tex"));
  const about = stripComments(read("frontmatter/aboutauthor.tex"));
  const members = [...profile.matchAll(/\\profilemember\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}/g)];
  for (const [order, m] of members.entries()) {
    const [, photo, name, roleUpper] = m;
    const detail = new RegExp(
      `\\\\textbf\\{${name}\\}\\s*--\\s*([^\\\\]+?)\\s*\\\\\\\\\\s*\\\\textit\\{Email:\\}\\s*(\\S+)`,
    ).exec(about);
    const photoFile = fs.existsSync(path.join(root, "photos/cropped", photo))
      ? `photos/cropped/${photo}`
      : `photos/${photo}`;
    const asset = await upload(photoFile, project.id);
    await db.insert(schema.people).values({
      projectId: project.id,
      name,
      role: detail?.[1].trim() ?? roleUpper,
      email: detail?.[2].trim() ?? "",
      photoAssetId: asset.id,
      order,
    });
  }
  console.log(`Imported ${members.length} team members.`);

  // ------------------------------------- sections, figures, references
  const result = await importReportContent(project.id, NAME, root);
  console.log(`Imported ${result.sections} sections, ${result.figures} figures, ${result.references} references.`);

  // ------------------------------------------------------ editor account
  if (SLUG === "sqlyst") {
    const email = "sqlyst@kshrd.local";
    let [editor] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (!editor) {
      [editor] = await db
        .insert(schema.users)
        .values({ email, name: "SQLyst Team", role: "EDITOR", passwordHash: await bcrypt.hash("sqlyst12345", 10) })
        .returning();
      console.log(`Created editor account ${email} / sqlyst12345`);
    }
    await db.insert(schema.projectMembers).values({ projectId: project.id, userId: editor.id }).onConflictDoNothing();
  }

  const real = result.warnings.filter((w) => !w.startsWith("---"));
  console.log(real.length ? `Import report:\n${result.warnings.join("\n")}` : "No import warnings.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
