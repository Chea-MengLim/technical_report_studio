import { NextResponse } from "next/server";
import { canAccessProject, getUser } from "@/lib/auth";
import { createAsset, MAX_UPLOAD_BYTES } from "@/lib/assets";

/** Upload an image (multipart: file, projectId). Without projectId it is a book asset (admin only). */
export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const projectId = (form.get("projectId") as string | null) || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "The file is larger than 15 MB." }, { status: 413 });

  const allowed = projectId ? await canAccessProject(user, projectId) : user.role === "ADMIN";
  if (!allowed) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  try {
    const asset = await createAsset(projectId, Buffer.from(await file.arrayBuffer()), file.name);
    return NextResponse.json({ id: asset.id, width: asset.width, height: asset.height });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
