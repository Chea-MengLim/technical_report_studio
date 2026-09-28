import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth";

/** Projects the user can open (all of them for an admin). */
export async function projectsForUser(user: SessionUser) {
  if (user.role === "ADMIN") {
    return db.select().from(schema.projects).orderBy(asc(schema.projects.bookOrder), asc(schema.projects.name));
  }
  const rows = await db
    .select({ projectId: schema.projectMembers.projectId })
    .from(schema.projectMembers)
    .where(eq(schema.projectMembers.userId, user.id));
  if (!rows.length) return [];
  return db
    .select()
    .from(schema.projects)
    .where(inArray(schema.projects.id, rows.map((r) => r.projectId)))
    .orderBy(asc(schema.projects.bookOrder), asc(schema.projects.name));
}

/** Section list for the sidebar (no content). lockedBy is set only for live locks. */
export async function sectionOutline(projectId: string) {
  const rows = await db
    .select({
      id: schema.sections.id,
      title: schema.sections.title,
      kind: schema.sections.kind,
      order: schema.sections.order,
      lockedById: schema.sections.lockedById,
      lockedAt: schema.sections.lockedAt,
      lockedBy: schema.users.name,
    })
    .from(schema.sections)
    .leftJoin(schema.users, eq(schema.users.id, schema.sections.lockedById))
    .where(eq(schema.sections.projectId, projectId))
    .orderBy(asc(schema.sections.order));
  const liveAfter = Date.now() - 2 * 60 * 1000;
  return rows.map((r) => ({ ...r, lockedBy: r.lockedAt && r.lockedAt.getTime() > liveAfter ? r.lockedBy : null }));
}

export async function recentBuilds(opts: { projectId?: string; kind: "PROJECT" | "BOOK" }, limit = 10) {
  return db
    .select()
    .from(schema.builds)
    .where(
      and(
        eq(schema.builds.kind, opts.kind),
        opts.projectId ? eq(schema.builds.projectId, opts.projectId) : undefined,
      ),
    )
    .orderBy(desc(schema.builds.createdAt))
    .limit(limit);
}
