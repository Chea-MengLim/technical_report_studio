import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canAccessProject, getUser } from "@/lib/auth";
import { signedGetUrl } from "@/lib/storage";

/** Shows an uploaded image by redirecting to a short-lived RustFS URL. */
export async function GET(_request: Request, ctx: RouteContext<"/api/assets/[id]">) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [asset] = await db.select().from(schema.assets).where(eq(schema.assets.id, id));
  if (!asset) return new NextResponse("Not found", { status: 404 });
  if (asset.projectId && !(await canAccessProject(user, asset.projectId))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = await signedGetUrl(asset.storageKey, { expiresIn: 3600 });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, max-age=1800" } });
}
