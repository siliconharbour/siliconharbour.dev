import type { Route } from "./+types/mcp-uploads.$id";
import { ImageInputError } from "~/lib/image-input.server";
import { receiveImageUpload } from "~/lib/mcp-image-uploads.server";

export function loader() {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "PUT" } });
}
export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PUT") return loader();
  try {
    await receiveImageUpload(params.id, request);
    return Response.json({ uploaded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ImageInputError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    throw error;
  }
}
