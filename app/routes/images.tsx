import type { Route } from "./+types/images";
import { existsSync, createReadStream } from "fs";
import { createReadableStreamFromReadable } from "@react-router/node";
import { getImagePath } from "~/lib/images.server";

export async function loader({ params }: Route.LoaderArgs) {
  const { filename } = params;

  if (!filename) {
    throw new Response("Not found", { status: 404 });
  }

  // Sanitize filename to prevent directory traversal
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const filepath = getImagePath(sanitizedFilename);

  if (!existsSync(filepath)) {
    throw new Response("Not found", { status: 404 });
  }

  const webStream = createReadableStreamFromReadable(createReadStream(filepath));

  const ext = sanitizedFilename.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "webp"
      ? "image/webp"
      : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : "application/octet-stream";

  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
