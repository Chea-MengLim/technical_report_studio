/**
 * Builds a PDF from the command line, exactly as the "Build" buttons do.
 *   npm run pdf -- <project-slug> [--out file.pdf]
 *   npm run pdf -- --book [--out book.pdf]
 */
import "dotenv/config";
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { bootstrap } from "@/lib/bootstrap";
import { buildNow } from "@/lib/latex/build";
import { getObject } from "@/lib/storage";

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  await bootstrap();
  let build;
  if (args.includes("--book")) {
    build = await buildNow({ kind: "BOOK" });
  } else {
    const slug = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.slug, slug ?? ""));
    if (!project) throw new Error(`No project with slug "${slug}"`);
    build = await buildNow({ kind: "PROJECT", projectId: project.id });
  }
  console.log(build.log);
  console.log(`\nBuild ${build.id}: ${build.status}${build.pages ? `, ${build.pages} pages` : ""}`);
  if (out && build.pdfKey) {
    fs.writeFileSync(out, await getObject(build.pdfKey));
    console.log(`Saved ${out}`);
  }
  process.exit(build.status === "SUCCESS" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
