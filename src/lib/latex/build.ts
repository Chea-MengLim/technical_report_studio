import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import pLimit from "p-limit";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Asset, Build } from "@/db/schema";
import { getObject, putObject } from "@/lib/storage";
import { renderBook, renderProject, type BookData, type ProjectData, type RenderResult } from "./document";

// Runtime paths (turbopackIgnore: they are not part of the traced server bundle).
const TEMPLATE_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "latex", "templates");
const BUILD_ROOT = process.env.BUILD_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".builds");
const TIMEOUT_MS = 10 * 60 * 1000;

// At most two LaTeX runs at the same time.
const limit = pLimit(2);

// ---------------------------------------------------------------------------
// Loading data

export async function getBook() {
  const [row] = await db.select().from(schema.book).where(eq(schema.book.id, 1));
  return row;
}

export async function loadProjectData(projectId: string): Promise<ProjectData> {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) throw new Error("Project not found");
  const [people, sections, references] = await Promise.all([
    db.select().from(schema.people).where(eq(schema.people.projectId, projectId)).orderBy(asc(schema.people.order)),
    db.select().from(schema.sections).where(eq(schema.sections.projectId, projectId)).orderBy(asc(schema.sections.order)),
    db
      .select()
      .from(schema.references)
      .where(eq(schema.references.projectId, projectId))
      .orderBy(asc(schema.references.order)),
  ]);
  return { project, people, sections, references };
}

/** Projects included in the book, in book order. */
export async function bookProjects() {
  const book = await getBook();
  const rows = await db.select().from(schema.projects).orderBy(asc(schema.projects.bookOrder), asc(schema.projects.name));
  return book.approvedOnly ? rows.filter((p) => p.status === "APPROVED") : rows;
}

export async function loadBookData(): Promise<BookData> {
  const book = await getBook();
  const projects = await bookProjects();
  const [preface] = book.prefaceSectionId
    ? await db.select().from(schema.sections).where(eq(schema.sections.id, book.prefaceSectionId))
    : [];
  return {
    book,
    preface: preface ?? null,
    projects: await Promise.all(projects.map((p) => loadProjectData(p.id))),
  };
}

async function allAssets(): Promise<Map<string, Asset>> {
  const rows = await db.select().from(schema.assets);
  return new Map(rows.map((a) => [a.id, a]));
}

export async function renderForBuild(build: Pick<Build, "kind" | "projectId">): Promise<RenderResult> {
  const assets = await allAssets();
  if (build.kind === "BOOK") return renderBook(await loadBookData(), assets);
  const book = await getBook();
  return renderProject(await loadProjectData(build.projectId!), book, assets);
}

// ---------------------------------------------------------------------------
// Running LaTeX

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let output = "";
    const append = (d: Buffer) => {
      output += d.toString();
      if (output.length > 400_000) output = output.slice(-200_000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      output += "\n[build] timed out, stopping LaTeX\n";
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, output: `${output}\n[build] could not start ${cmd}: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, output });
    });
  });
}

const LATEXMK_ARGS = ["latexmk", "-pdf", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "main.tex"];

function compile(dir: string) {
  if ((process.env.LATEX_RUNNER ?? "local") === "docker") {
    const image = process.env.LATEX_DOCKER_IMAGE ?? "texlive/texlive:latest";
    return run("docker", ["run", "--rm", "-v", `${dir}:/work`, "-w", "/work", image, ...LATEXMK_ARGS], dir);
  }
  return run(LATEXMK_ARGS[0], LATEXMK_ARGS.slice(1), dir);
}

/** Writes the LaTeX sources and images of a render into `dir`. */
export async function writeSources(dir: string, rendered: RenderResult) {
  await fs.mkdir(path.join(dir, "config"), { recursive: true });
  for (const f of await fs.readdir(TEMPLATE_DIR)) {
    await fs.copyFile(path.join(TEMPLATE_DIR, f), path.join(dir, "config", f));
  }
  for (const [rel, content] of Object.entries(rendered.files)) {
    const file = path.join(dir, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
  }
  const dl = pLimit(6);
  await Promise.all(
    rendered.assets.map(({ asset, path: rel }) =>
      dl(async () => {
        const file = path.join(dir, rel);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, await getObject(asset.storageKey));
      }),
    ),
  );
}

function zipDir(dir: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    archive.on("data", (c: Buffer) => chunks.push(c));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.directory(dir, false);
    archive.finalize();
  });
}

/** The interesting part of a LaTeX log: errors first, then the tail. */
function summarizeLog(output: string, logFile: string | null, warnings: string[]): string {
  const text = logFile ?? output;
  const lines = text.split(/\r?\n/);
  const errors = lines.filter((l) => /^!|:\d+: |LaTeX Error|Undefined control sequence/.test(l)).slice(0, 30);
  const parts: string[] = [];
  if (warnings.length) parts.push("Content warnings:\n" + warnings.map((w) => `  - ${w}`).join("\n"));
  if (errors.length) parts.push("LaTeX errors:\n" + errors.join("\n"));
  parts.push("Log (last lines):\n" + lines.slice(-80).join("\n"));
  return parts.join("\n\n");
}

async function executeBuild(buildId: string) {
  const [build] = await db.select().from(schema.builds).where(eq(schema.builds.id, buildId));
  if (!build) return;
  await db.update(schema.builds).set({ status: "RUNNING" }).where(eq(schema.builds.id, buildId));

  const dir = path.join(/*turbopackIgnore: true*/ BUILD_ROOT, buildId);
  let log = "";
  try {
    const rendered = await renderForBuild(build);
    await fs.rm(dir, { recursive: true, force: true });
    await writeSources(dir, rendered);

    // Zip the sources before compiling, so the zip has no build artefacts.
    const zip = await zipDir(dir);
    const zipKey = `builds/${buildId}/source.zip`;
    await putObject(zipKey, zip, "application/zip");

    const { code, output } = await compile(dir);
    const logFile = await fs.readFile(path.join(dir, "main.log"), "latin1").catch(() => null);
    log = summarizeLog(output, logFile, rendered.warnings);
    const pdf = await fs.readFile(path.join(dir, "main.pdf")).catch(() => null);
    const pages = Number(/Output written on main\.pdf \((\d+) page/.exec(logFile ?? output)?.[1] ?? 0) || null;

    if (code === 0 && pdf) {
      const pdfKey = `builds/${buildId}/main.pdf`;
      await putObject(pdfKey, pdf, "application/pdf");
      await db
        .update(schema.builds)
        .set({ status: "SUCCESS", pdfKey, zipKey, pages, log, finishedAt: new Date() })
        .where(eq(schema.builds.id, buildId));
    } else {
      await db
        .update(schema.builds)
        .set({ status: "FAILED", zipKey, log, finishedAt: new Date() })
        .where(eq(schema.builds.id, buildId));
    }
  } catch (err) {
    log += `\n[build] ${err instanceof Error ? err.stack ?? err.message : String(err)}`;
    await db
      .update(schema.builds)
      .set({ status: "FAILED", log, finishedAt: new Date() })
      .where(eq(schema.builds.id, buildId));
  } finally {
    if (process.env.KEEP_BUILD_DIRS !== "true") await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function startBuild(opts: { kind: "PROJECT" | "BOOK"; projectId?: string; userId: string }) {
  // Only one pending build per target: reuse a queued/running one.
  const pending = await db
    .select()
    .from(schema.builds)
    .where(
      and(
        eq(schema.builds.kind, opts.kind),
        opts.projectId ? eq(schema.builds.projectId, opts.projectId) : isNotNull(schema.builds.kind),
        inArray(schema.builds.status, ["QUEUED", "RUNNING"]),
      ),
    );
  if (pending.length) return pending[0];

  const [build] = await db
    .insert(schema.builds)
    .values({ kind: opts.kind, projectId: opts.projectId ?? null, createdById: opts.userId })
    .returning();
  void limit(() => executeBuild(build.id));
  return build;
}

/** Runs a build in the current process and waits for it (used by scripts). */
export async function buildNow(opts: { kind: "PROJECT" | "BOOK"; projectId?: string; userId?: string }) {
  const [build] = await db
    .insert(schema.builds)
    .values({ kind: opts.kind, projectId: opts.projectId ?? null, createdById: opts.userId ?? null })
    .returning();
  await executeBuild(build.id);
  const [done] = await db.select().from(schema.builds).where(eq(schema.builds.id, build.id));
  return done;
}
