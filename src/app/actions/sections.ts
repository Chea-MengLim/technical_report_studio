"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireProjectById, requireSection, requireAdmin } from "@/lib/auth";
import { collectRefTargets, emptyDoc, sanitizeDoc, type DocNode, type RefTarget } from "@/lib/doc";

/** A lock not renewed for this long is free again (the editor renews every 30 s). */
const LOCK_TTL_MS = 2 * 60 * 1000;
/** Autosaves by the same person within this window update one revision. */
const REVISION_WINDOW_MS = 10 * 60 * 1000;

type LockResult =
  | { ok: true; version: number }
  | { ok: false; lockedBy: string; lockedAt: string | null };

/** Takes (or renews) the edit lock on a section. */
export async function acquireLock(sectionId: string): Promise<LockResult> {
  const { user } = await requireSection(sectionId);
  const staleBefore = new Date(Date.now() - LOCK_TTL_MS);
  const [row] = await db
    .update(schema.sections)
    .set({ lockedById: user.id, lockedAt: new Date() })
    .where(
      and(
        eq(schema.sections.id, sectionId),
        or(
          isNull(schema.sections.lockedById),
          eq(schema.sections.lockedById, user.id),
          lt(schema.sections.lockedAt, staleBefore),
        ),
      ),
    )
    .returning({ version: schema.sections.version });
  if (row) return { ok: true, version: row.version };

  const [holder] = await db
    .select({ name: schema.users.name, lockedAt: schema.sections.lockedAt })
    .from(schema.sections)
    .innerJoin(schema.users, eq(schema.users.id, schema.sections.lockedById))
    .where(eq(schema.sections.id, sectionId));
  return { ok: false, lockedBy: holder?.name ?? "someone", lockedAt: holder?.lockedAt?.toISOString() ?? null };
}

export async function releaseLock(sectionId: string) {
  const { user } = await requireSection(sectionId);
  await db
    .update(schema.sections)
    .set({ lockedById: null, lockedAt: null })
    .where(and(eq(schema.sections.id, sectionId), eq(schema.sections.lockedById, user.id)));
}

export async function forceUnlock(sectionId: string) {
  await requireAdmin();
  await db.update(schema.sections).set({ lockedById: null, lockedAt: null }).where(eq(schema.sections.id, sectionId));
}

type SaveResult = { ok: true; version: number } | { ok: false; reason: "locked" | "conflict"; message: string };

export async function saveSection(
  sectionId: string,
  data: { title: string; content: DocNode },
  baseVersion: number,
): Promise<SaveResult> {
  await requireSection(sectionId);
  // Saving renews the lock; it fails only if someone else holds a live lock.
  const lock = await acquireLock(sectionId);
  if (!lock.ok) {
    return { ok: false, reason: "locked", message: `${lock.lockedBy} is now editing this section.` };
  }
  const { user, section } = await requireSection(sectionId);
  const title = data.title.trim() || "Untitled section";
  const content = sanitizeDoc(data.content);
  const [row] = await db
    .update(schema.sections)
    .set({
      title,
      content,
      version: sql`${schema.sections.version} + 1`,
      updatedById: user.id,
      updatedAt: new Date(),
      lockedAt: new Date(),
    })
    .where(and(eq(schema.sections.id, sectionId), eq(schema.sections.version, baseVersion)))
    .returning({ version: schema.sections.version });
  if (!row) {
    return {
      ok: false,
      reason: "conflict",
      message: "This section was changed somewhere else. Reload the page to get the latest version.",
    };
  }

  // Revision history: one snapshot per person per 10 minutes of editing.
  const [latest] = await db
    .select()
    .from(schema.sectionRevisions)
    .where(eq(schema.sectionRevisions.sectionId, sectionId))
    .orderBy(desc(schema.sectionRevisions.updatedAt))
    .limit(1);
  if (latest && latest.authorId === user.id && Date.now() - latest.updatedAt.getTime() < REVISION_WINDOW_MS) {
    await db
      .update(schema.sectionRevisions)
      .set({ title, content, updatedAt: new Date() })
      .where(eq(schema.sectionRevisions.id, latest.id));
  } else {
    await db.insert(schema.sectionRevisions).values({ sectionId, title, content, authorId: user.id });
  }

  if (title !== section.title) revalidatePath("/projects", "layout");
  return { ok: true, version: row.version };
}

export async function updateSectionMeta(
  sectionId: string,
  meta: { kind?: "FRONT" | "BODY" | "APPENDIX"; newPage?: boolean },
) {
  await requireSection(sectionId);
  await db
    .update(schema.sections)
    .set({ ...meta, updatedAt: new Date() })
    .where(eq(schema.sections.id, sectionId));
  revalidatePath("/projects", "layout");
}

export async function createSection(projectId: string, kind: "FRONT" | "BODY" | "APPENDIX", title: string) {
  await requireProjectById(projectId);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${schema.sections.order}), -1)::int` })
    .from(schema.sections)
    .where(eq(schema.sections.projectId, projectId));
  const [section] = await db
    .insert(schema.sections)
    .values({
      projectId,
      kind,
      title: title.trim() || "New section",
      order: max + 1,
      newPage: kind === "APPENDIX",
      content: emptyDoc(),
    })
    .returning();
  revalidatePath("/projects", "layout");
  return section.id;
}

export async function deleteSection(sectionId: string) {
  const { user, section } = await requireSection(sectionId);
  if (section.lockedById && section.lockedById !== user.id && section.lockedAt && Date.now() - section.lockedAt.getTime() < LOCK_TTL_MS) {
    throw new Error("Someone is editing this section right now.");
  }
  await db.delete(schema.sections).where(eq(schema.sections.id, sectionId));
  revalidatePath("/projects", "layout");
}

/** Saves a new order (and kind) for the project's sections, as shown in the sidebar. */
export async function reorderSections(
  projectId: string,
  items: { id: string; kind: "FRONT" | "BODY" | "APPENDIX" }[],
) {
  await requireProjectById(projectId);
  await db.transaction(async (tx) => {
    for (const [order, item] of items.entries()) {
      await tx
        .update(schema.sections)
        .set({ order, kind: item.kind })
        .where(and(eq(schema.sections.id, item.id), eq(schema.sections.projectId, projectId)));
    }
  });
  revalidatePath("/projects", "layout");
}

export async function restoreRevision(revisionId: string) {
  const [rev] = await db.select().from(schema.sectionRevisions).where(eq(schema.sectionRevisions.id, revisionId));
  if (!rev) throw new Error("Revision not found");
  const { user, section } = await requireSection(rev.sectionId);
  const lock = await acquireLock(section.id);
  if (!lock.ok) throw new Error(`${lock.lockedBy} is editing this section right now.`);
  await db
    .update(schema.sections)
    .set({
      title: rev.title,
      content: rev.content,
      version: sql`${schema.sections.version} + 1`,
      updatedById: user.id,
      updatedAt: new Date(),
      lockedById: null,
      lockedAt: null,
    })
    .where(eq(schema.sections.id, section.id));
  await db.insert(schema.sectionRevisions).values({
    sectionId: section.id,
    title: rev.title,
    content: rev.content,
    authorId: user.id,
  });
  revalidatePath("/projects", "layout");
}

/** Figures, tables and listings of a project that can be cross-referenced. */
export async function listRefTargets(projectId: string): Promise<RefTarget[]> {
  await requireProjectById(projectId);
  const rows = await db
    .select({ id: schema.sections.id, title: schema.sections.title, content: schema.sections.content })
    .from(schema.sections)
    .where(eq(schema.sections.projectId, projectId))
    .orderBy(asc(schema.sections.order));
  return collectRefTargets(rows);
}
