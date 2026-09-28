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
import {
  collectLabels,
  parseInline,
  parseSectionsFile,
  readGroup,
  stripComments,
  type ImportContext,
} from "@/lib/import/latex-to-doc";
import type { DocNode } from "@/lib/doc";

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

  // --------------------------------------------------------------- images
  const imageCache = new Map<string, string>();
  const figureFiles = fs.readdirSync(path.join(root, "figures"));
  const imagesToUpload = new Set<string>();
  const warnings: string[] = [];

  const sectionFiles = fs
    .readdirSync(path.join(root, "sections"))
    .filter((f) => f.endsWith(".tex"))
    .sort();
  const allSrc = sectionFiles.map((f) => read(`sections/${f}`)).join("\n");
  for (const m of allSrc.matchAll(/\\projfigure\{[^}]*\}\{([^}]+)\}/g)) imagesToUpload.add(m[1]);
  for (const file of imagesToUpload) {
    const name = figureFiles.find((f) => f === file || f.replace(/\.(png|jpe?g|pdf)$/i, "") === file);
    if (!name) continue;
    const asset = await upload(`figures/${name}`, project.id);
    imageCache.set(file, asset.id);
  }

  const ctx: ImportContext = {
    projectName: NAME,
    labels: new Map(),
    resolveImage: (file) => imageCache.get(file) ?? null,
    warnings,
  };
  collectLabels(allSrc, ctx.labels);

  // -------------------------------------------------------- front matter
  type NewSection = typeof schema.sections.$inferInsert;
  const rows: NewSection[] = [];
  const front = (file: string) =>
    read(file)
      .replace(/\{\\raggedright[^\n]*\\par\}/, "") // hand-written title
      .replace(/\\vspace\{[^}]*\}/g, "")
      .replace(/\\clearpage/g, "");

  const aboutIntro = front("frontmatter/aboutauthor.tex").split(/%\s*Row 1/)[0];
  const doc = (src: string): DocNode => ({
    type: "doc",
    content: stripComments(src)
      .split(/\n\s*\n/)
      .map((p) => parseInline(p, ctx))
      .filter((c) => c.length)
      .map((content) => ({ type: "paragraph", content })),
  });
  rows.push(
    { kind: "FRONT", title: "Project Contributors", newPage: true, special: "contributors", content: doc(aboutIntro) },
    { kind: "FRONT", title: "Acknowledgement", newPage: false, content: doc(front("frontmatter/acknowledgement.tex")) },
    { kind: "FRONT", title: "Executive Summary", newPage: true, content: doc(front("frontmatter/preface.tex")) },
  );

  // ----------------------------------------------------------- sections
  for (const file of sectionFiles) {
    ctx.warnings.push(`--- ${file}`);
    for (const s of parseSectionsFile(read(`sections/${file}`), ctx)) {
      if (!s.title) continue;
      const kind = /append/i.test(s.title) ? "APPENDIX" : "BODY";
      rows.push({ kind, title: titleCase(s.title), newPage: s.newPage, content: s.content });
    }
  }

  let order = 0;
  for (const r of rows) {
    const [section] = await db
      .insert(schema.sections)
      .values({ ...r, projectId: project.id, order: order++ })
      .returning();
    await db.insert(schema.sectionRevisions).values({
      sectionId: section.id,
      title: section.title,
      content: section.content,
    });
  }
  console.log(`Imported ${rows.length} sections.`);

  // ---------------------------------------------------------- references
  const bib = read("references.bib");
  const entries = [...bib.matchAll(/@\w+\{[^,]+,\s*key\s*=\s*\{([^}]+)\},\s*howpublished\s*=\s*/g)]
    .map((m) => {
      const start = m.index! + m[0].length;
      const [how] = readGroup(bib, start);
      const url = /\\url\{([^}]+)\}/.exec(how)?.[1] ?? "";
      const text = how.replace(/\\url\{[^}]+\}/, "").replace(/:\s*$/, "").trim();
      return { key: m[1], text, url };
    })
    .sort((a, b) => a.key.localeCompare(b.key)); // bibliographystyle{plain} sorts by key
  for (const [i, e] of entries.entries()) {
    await db.insert(schema.references).values({ projectId: project.id, order: i, text: e.text, url: e.url });
  }
  console.log(`Imported ${entries.length} references.`);

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

  const real = warnings.filter((w) => !w.startsWith("---"));
  console.log(real.length ? `Import report:\n${warnings.join("\n")}` : "No import warnings.");
}

/** "RELATED TECHNOLOGIES" -> "Related Technologies" (the PDF prints titles in capitals anyway). */
function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(And|Of|The|In|For|To)\b/g, (w) => w.toLowerCase())
    .replace(/^./, (c) => c.toUpperCase());
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
