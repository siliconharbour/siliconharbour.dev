import { useFetcher } from "react-router";
import { ImageUpload } from "~/components/ImageUpload";
import type { ProjectImage } from "~/db/schema";

type GalleryImage = Pick<ProjectImage, "id" | "image" | "caption">;
type GalleryResult = { success: true } | { error: string };

export function ProjectGalleryEditor({ images }: { images: GalleryImage[] }) {
  const fetcher = useFetcher<GalleryResult>();
  const busy = fetcher.state !== "idle";
  function move(index: number, direction: -1 | 1) {
    const ids = images.map((image) => image.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    const form = new FormData();
    form.set("intent", "reorderGallery");
    for (const id of ids) form.append("imageIds", String(id));
    fetcher.submit(form, { method: "post" });
  }
  return (
    <section
      className="flex flex-col gap-gap-4 border-t border-line pt-pad-6"
      aria-labelledby="gallery-heading"
    >
      <h2 id="gallery-heading" className="text-xl font-semibold text-heading">
        Gallery images
      </h2>
      <div className="grid grid-cols-1 gap-gap-4 sm:grid-cols-2">
        {images.map((image, index) => (
          <div
            key={image.id}
            className="flex flex-col gap-gap-3 border border-line bg-surface p-pad-3"
          >
            <img
              src={`/images/${image.image}`}
              alt={image.caption ?? ""}
              className="aspect-video w-full object-cover"
            />
            <fetcher.Form method="post" className="flex flex-col gap-gap-2">
              <input type="hidden" name="imageId" value={image.id} />
              <label className="flex flex-col gap-gap-1 text-sm text-body">
                Caption
                <input
                  name="caption"
                  maxLength={2000}
                  defaultValue={image.caption ?? ""}
                  className="border border-line bg-surface px-pad-3 py-pad-2"
                />
              </label>
              <div className="flex flex-wrap gap-gap-2">
                <button
                  name="intent"
                  value="updateGalleryImage"
                  disabled={busy}
                  className="border border-line px-pad-3 py-pad-1-5 text-sm text-body disabled:opacity-50"
                >
                  Save caption
                </button>
                <button
                  name="intent"
                  value="removeGalleryImage"
                  disabled={busy}
                  onClick={(event) => {
                    if (!confirm("Remove this image?")) event.preventDefault();
                  }}
                  className="border border-red-200 px-pad-3 py-pad-1-5 text-sm text-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
                <button
                  type="button"
                  aria-label={`Move image ${index + 1} up`}
                  onClick={() => move(index, -1)}
                  disabled={busy || index === 0}
                  className="border border-line px-pad-2 py-pad-1-5 text-sm text-body disabled:opacity-50"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move image ${index + 1} down`}
                  onClick={() => move(index, 1)}
                  disabled={busy || index === images.length - 1}
                  className="border border-line px-pad-2 py-pad-1-5 text-sm text-body disabled:opacity-50"
                >
                  ↓
                </button>
              </div>
            </fetcher.Form>
          </div>
        ))}
      </div>
      <fetcher.Form method="post" className="flex flex-col gap-gap-3">
        <input type="hidden" name="intent" value="addGalleryImage" />
        <ImageUpload
          label="Add gallery image"
          name="galleryImageData"
          aspect={16 / 9}
          previewStyle="cover"
        />
        <label className="flex flex-col gap-gap-1 text-sm text-body">
          Caption (optional)
          <input
            name="caption"
            maxLength={2000}
            className="border border-line bg-surface px-pad-3 py-pad-2"
          />
        </label>
        <button
          disabled={busy}
          className="self-start bg-primary px-pad-4 py-pad-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add to gallery
        </button>
      </fetcher.Form>
      {fetcher.state === "idle" && fetcher.data && "success" in fetcher.data && (
        <p role="status" className="text-sm text-green-700">
          Saved
        </p>
      )}
      {fetcher.data && "error" in fetcher.data && (
        <p role="alert" className="text-sm text-red-700">
          {fetcher.data.error}
        </p>
      )}
    </section>
  );
}
