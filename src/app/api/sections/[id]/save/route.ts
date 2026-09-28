import { NextResponse } from "next/server";
import { saveSection } from "@/app/actions/sections";

/**
 * Last-chance save when an editor tab is closed or reloaded with unsaved
 * changes (fetch with keepalive, which cannot call a server action).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/sections/[id]/save">) {
  const { id } = await ctx.params;
  try {
    const body = await request.json();
    const res = await saveSection(id, { title: String(body.title ?? ""), content: body.content }, Number(body.version));
    return NextResponse.json(res);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
