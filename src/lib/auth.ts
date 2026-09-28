import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";

const COOKIE = "session";
const MAX_AGE_DAYS = 7;
const key = new TextEncoder().encode(process.env.SESSION_SECRET);

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

export async function createSession(userId: string) {
  const expires = new Date(Date.now() + MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user, or null. Cached for the duration of one request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub));
    return user ?? null;
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();
  return user;
}

export async function canAccessProject(user: SessionUser, projectId: string) {
  if (user.role === "ADMIN") return true;
  const [row] = await db
    .select()
    .from(schema.projectMembers)
    .where(
      and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, user.id)),
    );
  return !!row;
}

/** Loads a project by slug and checks that the user may edit it. */
export async function requireProjectBySlug(slug: string) {
  const user = await requireUser();
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.slug, slug));
  if (!project || !(await canAccessProject(user, project.id))) notFound();
  return { user, project };
}

export async function requireProjectById(projectId: string) {
  const user = await requireUser();
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project || !(await canAccessProject(user, project.id))) throw new Error("Not allowed");
  return { user, project };
}

/**
 * Loads a section and checks access. Book-level sections (the preface,
 * projectId = null) are admin-only.
 */
export async function requireSection(sectionId: string) {
  const user = await requireUser();
  const [section] = await db.select().from(schema.sections).where(eq(schema.sections.id, sectionId));
  if (!section) throw new Error("Section not found");
  const allowed = section.projectId
    ? await canAccessProject(user, section.projectId)
    : user.role === "ADMIN";
  if (!allowed) throw new Error("Not allowed");
  return { user, section };
}
