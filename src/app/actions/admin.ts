"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { startBuild } from "@/lib/latex/build";

// ---------------------------------------------------------------- users

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.email("Enter a valid email").trim().toLowerCase(),
  password: z.string().min(8, "The password needs at least 8 characters"),
  role: z.enum(["ADMIN", "EDITOR"]),
});

export async function createUser(_prev: string | null, form: FormData): Promise<string | null> {
  await requireAdmin();
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const { name, email, password, role } = parsed.data;
  const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (exists) return "An account with this email already exists.";
  const [user] = await db
    .insert(schema.users)
    .values({ name, email, role, passwordHash: await bcrypt.hash(password, 10) })
    .returning();
  const projectId = String(form.get("projectId") ?? "");
  if (projectId) await db.insert(schema.projectMembers).values({ projectId, userId: user.id });
  revalidatePath("/admin", "layout");
  return null;
}

export async function resetPassword(userId: string, password: string) {
  await requireAdmin();
  if (password.length < 8) throw new Error("The password needs at least 8 characters");
  await db
    .update(schema.users)
    .set({ passwordHash: await bcrypt.hash(password, 10) })
    .where(eq(schema.users.id, userId));
}

export async function setUserRole(userId: string, role: "ADMIN" | "EDITOR") {
  const me = await requireAdmin();
  if (userId === me.id) throw new Error("You cannot change your own role.");
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  revalidatePath("/admin", "layout");
}

export async function deleteUser(userId: string) {
  const me = await requireAdmin();
  if (userId === me.id) throw new Error("You cannot delete your own account.");
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  revalidatePath("/admin", "layout");
}

// ---------------------------------------------------------------- book

const bookSchema = z.object({
  title: z.string().trim().min(1, "The book title is required").max(160),
  subtitle: z.string().trim().max(80),
  description: z.string().trim().max(800),
  academicYear: z.string().trim().max(40),
  copyright: z.string().trim().max(160),
  tocDepth: z.coerce.number().int().min(0).max(3),
  approvedOnly: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function updateBook(_prev: string | null, form: FormData): Promise<string | null> {
  await requireAdmin();
  const parsed = bookSchema.safeParse({ approvedOnly: "false", ...Object.fromEntries(form) });
  if (!parsed.success) return parsed.error.issues[0].message;
  await db
    .update(schema.book)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.book.id, 1));
  revalidatePath("/admin", "layout");
  return "Saved.";
}

export async function setInstitutionLogo(assetId: string | null) {
  await requireAdmin();
  await db.update(schema.book).set({ institutionLogoAssetId: assetId }).where(eq(schema.book.id, 1));
  revalidatePath("/", "layout");
}

export async function buildBook() {
  const user = await requireAdmin();
  const build = await startBuild({ kind: "BOOK", userId: user.id });
  revalidatePath("/admin", "layout");
  return build.id;
}
