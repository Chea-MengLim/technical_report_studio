import path from "node:path";
import bcrypt from "bcryptjs";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, schema } from "@/db";
import { emptyDoc } from "@/lib/doc";

/**
 * Runs once when the server starts (see src/instrumentation.ts) and from
 * scripts: applies migrations, creates the book row, the first admin and
 * the book preface section, and fails builds a previous process left running.
 */
export async function bootstrap() {
  await migrate(db, { migrationsFolder: path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });

  await db.insert(schema.book).values({ id: 1 }).onConflictDoNothing();
  const [bookRow] = await db.select().from(schema.book).where(eq(schema.book.id, 1));
  if (!bookRow.prefaceSectionId) {
    const [preface] = await db
      .insert(schema.sections)
      .values({ kind: "FRONT", title: "Preface", newPage: true, content: emptyDoc() })
      .returning();
    await db.update(schema.book).set({ prefaceSectionId: preface.id }).where(eq(schema.book.id, 1));
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
  if (count === 0) {
    const email = (process.env.ADMIN_EMAIL ?? "admin@kshrd.local").toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? "admin12345";
    await db.insert(schema.users).values({
      email,
      name: "Administrator",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 10),
    });
    console.log(`[bootstrap] created admin account ${email}`);
  }

  await db
    .update(schema.builds)
    .set({ status: "FAILED", log: "Server restarted while this build was running.", finishedAt: new Date() })
    .where(inArray(schema.builds.status, ["QUEUED", "RUNNING"]));
}
