import { randomUUID } from "node:crypto";
import { imageSize } from "image-size";
import { db, schema } from "@/db";
import { putObject } from "@/lib/storage";

/** Image types pdfLaTeX can include directly. */
export const IMAGE_TYPES: Record<string, { ext: string; mime: string }> = {
  "image/png": { ext: "png", mime: "image/png" },
  "image/jpeg": { ext: "jpg", mime: "image/jpeg" },
  "application/pdf": { ext: "pdf", mime: "application/pdf" },
};
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function detectType(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return IMAGE_TYPES["image/png"];
  if (buf[0] === 0xff && buf[1] === 0xd8) return IMAGE_TYPES["image/jpeg"];
  if (buf.subarray(0, 5).toString() === "%PDF-") return IMAGE_TYPES["application/pdf"];
  return null;
}

/**
 * Stores an uploaded image in RustFS and records it. The type is detected
 * from the file content, not the name. projectId null = book asset.
 */
export async function createAsset(projectId: string | null, buf: Buffer, filename: string) {
  const type = detectType(buf);
  if (!type) throw new Error("Only PNG, JPEG or PDF files can be used in the report.");
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error("The file is larger than 15 MB.");
  let width: number | null = null;
  let height: number | null = null;
  if (type.ext !== "pdf") {
    try {
      const size = imageSize(buf);
      width = size.width ?? null;
      height = size.height ?? null;
    } catch {
      throw new Error("The image could not be read.");
    }
  }
  const id = randomUUID();
  const storageKey = `${projectId ? `projects/${projectId}` : "book"}/assets/${id}.${type.ext}`;
  await putObject(storageKey, buf, type.mime);
  const [asset] = await db
    .insert(schema.assets)
    .values({ id, projectId, storageKey, filename, mime: type.mime, ext: type.ext, width, height })
    .returning();
  return asset;
}
