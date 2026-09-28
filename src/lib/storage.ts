import {
  S3Client,
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * RustFS object storage (S3-compatible API).
 * `internal` talks to RustFS from the server; `public` signs URLs that the
 * browser will open, so they must carry the host the browser can reach.
 */
function makeClient(endpoint: string) {
  return new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
}

const internal = makeClient(process.env.S3_ENDPOINT ?? "http://localhost:9000");
const publicClient = makeClient(
  process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? "http://localhost:9000",
);
export const BUCKET = process.env.S3_BUCKET ?? "book-assets";

let bucketReady: Promise<void> | null = null;
function ensureBucket() {
  bucketReady ??= (async () => {
    try {
      await internal.send(new HeadBucketCommand({ Bucket: BUCKET }));
    } catch {
      await internal.send(new CreateBucketCommand({ Bucket: BUCKET }));
    }
  })().catch((err) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

export async function putObject(key: string, body: Buffer | Uint8Array, contentType: string) {
  await ensureBucket();
  await internal.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObject(key: string): Promise<Buffer> {
  await ensureBucket();
  const res = await internal.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function deleteObject(key: string) {
  await ensureBucket();
  await internal.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** A short-lived URL the browser can open directly. */
export async function signedGetUrl(
  key: string,
  opts: { downloadName?: string; expiresIn?: number } = {},
) {
  await ensureBucket();
  return getSignedUrl(
    publicClient,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: opts.downloadName
        ? `attachment; filename="${opts.downloadName.replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn: opts.expiresIn ?? 3600 },
  );
}
