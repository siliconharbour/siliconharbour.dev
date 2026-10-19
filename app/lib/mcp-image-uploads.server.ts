import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DATA_DIR } from "./paths.server";
import {
  ImageInputError,
  MAX_IMAGE_BYTES,
  imageContentType,
  imageContentTypeSchema,
  validateImage,
} from "./image-input.server";

const UPLOAD_DIR = join(DATA_DIR, "mcp-uploads");
const LIFETIME_MS = 10 * 60_000;
const MAX_SLOTS = 32;
const idPattern = /^[a-f0-9]{32}$/;
export const prepareImageUploadSchema = z
  .object({
    filename: z.string().min(1).max(200).optional(),
    contentType: imageContentTypeSchema,
    size: z.number().int().min(1).max(MAX_IMAGE_BYTES),
  })
  .strict();
const uploadRecordSchema = prepareImageUploadSchema.extend({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
});
type UploadState = "pending" | "receiving" | "ready" | "attaching";
const hash = (value: string) => createHash("sha256").update(value).digest();
function directory(id: string) {
  if (!idPattern.test(id)) throw new ImageInputError("Upload not found or expired.", 410);
  return join(UPLOAD_DIR, id);
}
function metadata(id: string) {
  try {
    const upload = uploadRecordSchema.parse(
      JSON.parse(readFileSync(join(directory(id), "metadata.json"), "utf8")),
    );
    if (upload.expiresAt <= Date.now()) throw new Error("Expired");
    return upload;
  } catch {
    throw new ImageInputError("Upload not found or expired.", 410);
  }
}
function claim(id: string, from: UploadState, to: UploadState) {
  try {
    renameSync(join(directory(id), from), join(directory(id), to));
  } catch {
    throw new ImageInputError("Upload is not ready or has already been used.", 409);
  }
}
export function cleanupImageUploads() {
  if (!existsSync(UPLOAD_DIR)) return;
  for (const id of readdirSync(UPLOAD_DIR)) {
    if (!idPattern.test(id)) continue;
    try {
      metadata(id);
    } catch {
      rmSync(directory(id), { recursive: true, force: true });
    }
  }
}
let cleanupTimer: ReturnType<typeof setInterval> | undefined;
export function startImageUploadCleanup() {
  if (cleanupTimer) return;
  const cleanup = () => {
    try {
      cleanupImageUploads();
    } catch (error) {
      console.error("MCP upload cleanup failed", error);
    }
  };
  cleanup();
  cleanupTimer = setInterval(cleanup, 60_000);
  cleanupTimer.unref();
}

export function prepareImageUpload(input: unknown, origin: URL) {
  const data = prepareImageUploadSchema.parse(input);
  mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o700 });
  cleanupImageUploads();
  // Keep reservation synchronous to enforce the per-process slot cap.
  if (readdirSync(UPLOAD_DIR).filter((id) => idPattern.test(id)).length >= MAX_SLOTS)
    throw new ImageInputError("Upload slots are full. Try again after unused uploads expire.", 429);
  const uploadId = randomBytes(16).toString("hex");
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + LIFETIME_MS;
  const path = directory(uploadId);
  mkdirSync(path, { mode: 0o700 });
  try {
    writeFileSync(
      join(path, "metadata.json"),
      JSON.stringify({ ...data, expiresAt, tokenHash: hash(token).toString("hex") }),
      { mode: 0o600, flag: "wx" },
    );
    writeFileSync(join(path, "pending"), "", { mode: 0o600, flag: "wx" });
  } catch (error) {
    rmSync(path, { recursive: true, force: true });
    throw error;
  }
  return {
    uploadId,
    uploadUrl: new URL(`/api/mcp-uploads/${uploadId}`, origin).href,
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": data.contentType },
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function receiveImageUpload(id: string, request: Request) {
  const upload = metadata(id);
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token || !timingSafeEqual(hash(token), Buffer.from(upload.tokenHash, "hex")))
    throw new ImageInputError("Invalid upload token.", 401);
  if (imageContentType(request.headers.get("content-type")) !== upload.contentType)
    throw new ImageInputError("Content type does not match the prepared upload.", 415);
  const length = request.headers.get("content-length");
  if (length !== null && Number(length) !== upload.size)
    throw new ImageInputError("Size does not match the prepared upload.", 413);
  claim(id, "pending", "receiving");
  const signal = AbortSignal.timeout(Math.max(0, Math.min(30_000, upload.expiresAt - Date.now())));
  try {
    if (!request.body) throw new ImageInputError("Missing image body.");
    const body = Readable.fromWeb(request.body as NodeReadableStream, { signal });
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      size += chunk.length;
      if (size > upload.size) throw new ImageInputError("Image exceeds the prepared size.", 413);
      chunks.push(chunk);
    }
    if (size !== upload.size)
      throw new ImageInputError("Size does not match the prepared upload.", 413);
    const bytes = Buffer.concat(chunks);
    await validateImage(bytes, upload.contentType);
    metadata(id);
    await writeFile(join(directory(id), "image"), bytes, { flag: "wx", mode: 0o600 });
    signal.throwIfAborted();
    claim(id, "receiving", "ready");
  } catch (error) {
    rmSync(directory(id), { recursive: true, force: true });
    if (signal.aborted) throw new ImageInputError("Upload timed out.", 408);
    throw error;
  }
}

export async function consumeImageUpload<T>(
  id: string,
  attach: (bytes: Buffer) => Promise<T>,
): Promise<T> {
  metadata(id);
  claim(id, "ready", "attaching");
  try {
    return await attach(await readFile(join(directory(id), "image")));
  } finally {
    rmSync(directory(id), { recursive: true, force: true });
  }
}
