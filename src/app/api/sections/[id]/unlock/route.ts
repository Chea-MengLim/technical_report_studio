import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";

/** Called with navigator.sendBeacon when an editor tab is closed. */
export async function POST(_request: Request, ctx: RouteContext<"/api/sections/[id]/unlock">) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 204 });
  await db
    .update(schema.sections)
    .set({ lockedById: null, lockedAt: null })
    .where(and(eq(schema.sections.id, id), eq(schema.sections.lockedById, user.id)));
  return new NextResponse(null, { status: 204 });
}
