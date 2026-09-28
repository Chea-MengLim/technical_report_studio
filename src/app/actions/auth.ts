"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return "Wrong email or password.";
  }
  await createSession(user.id);
  redirect("/projects");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changeOwnPassword(_prev: string | null, form: FormData): Promise<string | null> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 8) return "The new password needs at least 8 characters.";
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  if (!(await bcrypt.compare(current, row.passwordHash))) return "The current password is wrong.";
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(next, 10) }).where(eq(schema.users.id, user.id));
  return "Password changed.";
}
