import type { Route } from "./+types/images";
import { existsSync, createReadStream } from "fs";
import { join } from "path";

export async function loader({ params }: Route.LoaderArgs) {
  const { filename } = params;
  
  if (!filename) {
    throw new Response("Not found", { status: 404 });
  }

  // Sanitize filename to prevent directory traversal
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const filepath = join("./data/images", sanitizedFilename);

  if (!existsSync(filepath)) {
    throw new Response("Not found", { status: 404 });
  }

  const stream = createReadStream(filepath);
  
  // Convert Node stream to Web ReadableStream
  const webStream = new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) => {
        controller.enqueue(chunk);
      });
      stream.on("end", () => {
        controller.close();
      });
      stream.on("error", (err) => {
        controller.error(err);
      });
    },
  });

  // Determine content type based on extension
  const ext = sanitizedFilename.split(".").pop()?.toLowerCase();
  const contentType = ext === "webp" ? "image/webp" : 
                      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
                      ext === "png" ? "image/png" : "application/octet-stream";

  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
