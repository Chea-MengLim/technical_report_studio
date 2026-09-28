"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin, requireProjectById } from "@/lib/auth";
import { emptyDoc } from "@/lib/doc";
import { startBuild } from "@/lib/latex/build";

// ---------------------------------------------------------------- editors

const settingsSchema = z.object({
  name: z.string().trim().min(1, "The project name is required").max(60),
  tagline: z.string().trim().max(120),
  description: z.string().trim().max(600),
  reportType: z.string().trim().min(1).max(40),
  footerName: z.string().trim().max(80),
  teamName: z.string().trim().max(80),
});

export async function updateProjectSettings(projectId: string, _prev: string | null, form: FormData) {
  await requireProjectById(projectId);
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  await db
    .update(schema.projects)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
  revalidatePath("/projects", "layout");
  return "Saved.";
}

export async function setProjectLogo(projectId: string, assetId: string | null) {
  await requireProjectById(projectId);
  await db.update(schema.projects).set({ logoAssetId: assetId }).where(eq(schema.projects.id, projectId));
  revalidatePath("/projects", "layout");
}

export async function submitProject(projectId: string) {
  await requireProjectById(projectId);
  await db
    .update(schema.projects)
    .set({ status: "SUBMITTED", updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
  revalidatePath("/", "layout");
}

export async function buildProject(projectId: string) {
  const { user } = await requireProjectById(projectId);
  const build = await startBuild({ kind: "PROJECT", projectId, userId: user.id });
  revalidatePath("/projects", "layout");
  return build.id;
}

export async function getBuildStatus(buildId: string) {
  const [b] = await db
    .select({
      status: schema.builds.status,
      projectId: schema.builds.projectId,
      kind: schema.builds.kind,
    })
    .from(schema.builds)
    .where(eq(schema.builds.id, buildId));
  if (!b) return null;
  if (b.kind === "BOOK") await requireAdmin();
  else await requireProjectById(b.projectId!);
  return b.status;
}

// ---------------------------------------------------------------- team members (people)

const personSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  role: z.string().trim().max(80),
  email: z.string().trim().max(120),
});

export async function savePerson(
  projectId: string,
  personId: string | null,
  data: { name: string; role: string; email: string; photoAssetId: string | null },
) {
  await requireProjectById(projectId);
  const parsed = personSchema.parse(data);
  if (personId) {
    await db
      .update(schema.people)
      .set({ ...parsed, photoAssetId: data.photoAssetId })
      .where(and(eq(schema.people.id, personId), eq(schema.people.projectId, projectId)));
  } else {
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${schema.people.order}), -1)::int` })
      .from(schema.people)
      .where(eq(schema.people.projectId, projectId));
    await db.insert(schema.people).values({ ...parsed, photoAssetId: data.photoAssetId, projectId, order: max + 1 });
  }
  revalidatePath("/projects", "layout");
}

export async function deletePerson(projectId: string, personId: string) {
  await requireProjectById(projectId);
  await db.delete(schema.people).where(and(eq(schema.people.id, personId), eq(schema.people.projectId, projectId)));
  revalidatePath("/projects", "layout");
}

export async function reorderPeople(projectId: string, ids: string[]) {
  await requireProjectById(projectId);
  await db.transaction(async (tx) => {
    for (const [order, id] of ids.entries()) {
      await tx
        .update(schema.people)
        .set({ order })
        .where(and(eq(schema.people.id, id), eq(schema.people.projectId, projectId)));
    }
  });
  revalidatePath("/projects", "layout");
}

// ---------------------------------------------------------------- references

export async function saveReferences(projectId: string, refs: { text: string; url: string }[]) {
  await requireProjectById(projectId);
  const clean = refs
    .map((r) => ({ text: r.text.trim().slice(0, 300), url: r.url.trim().slice(0, 500) }))
    .filter((r) => r.text || r.url);
  for (const r of clean) {
    if (r.url && !/^https?:\/\//i.test(r.url)) throw new Error(`"${r.url}" is not a web address (https://...)`);
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.references).where(eq(schema.references.projectId, projectId));
    if (clean.length) {
      await tx.insert(schema.references).values(clean.map((r, order) => ({ ...r, order, projectId })));
    }
  });
  revalidatePath("/projects", "layout");
}

// ---------------------------------------------------------------- admin

const DEFAULT_SECTIONS: { kind: "FRONT" | "BODY" | "APPENDIX"; title: string; newPage?: boolean; special?: string }[] = [
  { kind: "FRONT", title: "Project Contributors", newPage: true, special: "contributors" },
  { kind: "FRONT", title: "Acknowledgement" },
  { kind: "FRONT", title: "Executive Summary", newPage: true },
  { kind: "BODY", title: "Introduction" },
  { kind: "BODY", title: "Related Technologies" },
  { kind: "BODY", title: "Analysis" },
  { kind: "BODY", title: "Planning" },
  { kind: "BODY", title: "System Design", newPage: true },
  { kind: "BODY", title: "Implementation", newPage: true },
  { kind: "BODY", title: "Evaluation" },
  { kind: "BODY", title: "Conclusion" },
  { kind: "APPENDIX", title: "Appendixes", newPage: true },
];

export async function createProject(_prev: string | null, form: FormData): Promise<string | null> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name) return "The project name is required.";
  if (!slug) return "The short id is required (letters, numbers and -).";
  const [exists] = await db.select().from(schema.projects).where(eq(schema.projects.slug, slug));
  if (exists) return `A project with the id "${slug}" already exists.`;
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${schema.projects.bookOrder}), 0)::int` })
    .from(schema.projects);
  const [project] = await db
    .insert(schema.projects)
    .values({ name, slug, footerName: `${name} Web Application`, bookOrder: max + 1 })
    .returning();
  await db.insert(schema.sections).values(
    DEFAULT_SECTIONS.map((s, order) => ({
      projectId: project.id,
      kind: s.kind,
      title: s.title,
      order,
      newPage: s.newPage ?? false,
      special: s.special ?? null,
      content: emptyDoc(),
    })),
  );
  revalidatePath("/", "layout");
  redirect(`/admin/projects`);
}

export async function setProjectStatus(
  projectId: string,
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED",
  comment?: string,
) {
  await requireAdmin();
  await db
    .update(schema.projects)
    .set({ status, reviewComment: comment ?? null, updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
  revalidatePath("/", "layout");
}

export async function deleteProject(projectId: string) {
  await requireAdmin();
  await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
  revalidatePath("/", "layout");
}

export async function setProjectMembers(projectId: string, userIds: string[]) {
  await requireAdmin();
  await db.transaction(async (tx) => {
    await tx.delete(schema.projectMembers).where(eq(schema.projectMembers.projectId, projectId));
    if (userIds.length) {
      await tx.insert(schema.projectMembers).values(userIds.map((userId) => ({ projectId, userId })));
    }
  });
  revalidatePath("/", "layout");
}

export async function reorderBookProjects(ids: string[]) {
  await requireAdmin();
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx.update(schema.projects).set({ bookOrder: i + 1 }).where(eq(schema.projects.id, id));
    }
  });
  revalidatePath("/admin", "layout");
}
