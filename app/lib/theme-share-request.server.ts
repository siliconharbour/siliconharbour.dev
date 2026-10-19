import { createHash } from "node:crypto";
import { checkRateLimit, cleanupExpiredRateLimits } from "./ratelimit.server";

export async function readThemeShareRequest(request: Request, ip: string) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new Response("Same-origin requests only.", { status: 403 });
  const key = createHash("sha256").update(ip).digest("hex");
  for (const [scope, limit, seconds] of [
    ["burst", 5, 600],
    ["day", 20, 86400],
  ] as const) {
    const rate = await checkRateLimit(`theme-share:${scope}:${key}`, limit, seconds);
    if (!rate.allowed)
      throw new Response("Too many share attempts. Please try again later.", {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000)),
          ),
        },
      });
  }
  await cleanupExpiredRateLimits();
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Response("Send JSON.", { status: 415 });
  const max = 768 * 1024;
  if (Number(request.headers.get("content-length")) > max)
    throw new Response("Theme upload is too large.", { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw new Response("Missing theme.", { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new Response("Theme upload is too large.", { status: 413 });
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Response("Invalid JSON.", { status: 400 });
  }
}
