import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canAccessProject, getUser } from "@/lib/auth";
import { signedGetUrl } from "@/lib/storage";

/** /api/builds/<id>/pdf (inline) or /api/builds/<id>/zip (download). */
export async function GET(_request: Request, ctx: RouteContext<"/api/builds/[id]/[file]">) {
  const { id, file } = await ctx.params;
  const user = await getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [build] = await db.select().from(schema.builds).where(eq(schema.builds.id, id));
  if (!build) return new NextResponse("Not found", { status: 404 });

  if (build.kind === "BOOK" ? user.role !== "ADMIN" : !(await canAccessProject(user, build.projectId!))) {
    return new NextResponse("Not found", { status: 404 });
  }
  let name = "book";
  if (build.projectId) {
    const [p] = await db.select({ slug: schema.projects.slug }).from(schema.projects).where(eq(schema.projects.id, build.projectId));
    name = p?.slug ?? "project";
  }
  const key = file === "pdf" ? build.pdfKey : file === "zip" ? build.zipKey : null;
  if (!key) return new NextResponse("Not found", { status: 404 });
  const url = await signedGetUrl(key, {
    downloadName: file === "zip" ? `${name}-latex.zip` : undefined,
  });
  return NextResponse.redirect(url);
}
