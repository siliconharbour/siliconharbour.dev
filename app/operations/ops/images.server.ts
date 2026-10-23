import { z } from "zod";
import { defineOperation } from "../define";
import { emptyInput, confirm } from "../fields";
import {
  imageSetInput,
  imageAttachInput,
  imageClearInput,
  imageUploadInput,
  imageAttachedOutput,
  imageUploadOutput,
  orphanListInput,
  orphanStageInput,
  orphanDeleteInput,
  orphanListOutput,
  orphanDeleteOutput,
  orphanStageOutput,
} from "../contracts/images";
import { setEntityImage, attachImage, clearEntityImage } from "~/lib/entity-images.server";
import { prepareImageUpload } from "~/lib/mcp-image-uploads.server";
import { getOAuthIssuerUrl } from "~/mcp/oauth.server";
import {
  getOrphanedImagesState,
  stageOrphanedImagesBatch,
  deleteStagedOrphan,
  deleteAllStagedOrphans,
} from "~/lib/image-orphans.server";
export const imageOperations = {
  imageSetFromUrl: defineOperation({
    name: "imageSetFromUrl",
    area: "images",
    risk: "destructive",
    access: "admin",
    summary: "Set an entity image from a public URL.",
    description:
      "Fetch a public HTTPS image through the address guard, validate its bytes and dimensions, and save WebP. Clean up the previous file when unreferenced. Review/visibility status does not change. Requires confirm: true.",
    input: imageSetInput,
    output: imageAttachedOutput,
    examples: [
      {
        title: "Set cover",
        input: {
          type: "event",
          id: 1,
          role: "cover",
          confirm: true,
          url: "https://example.com/cover.png",
        },
      },
    ],
    run: (_ctx, input) => setEntityImage(input),
  }),
  imageUploadPrepare: defineOperation({
    name: "imageUploadPrepare",
    area: "images",
    risk: "write",
    access: "admin",
    summary: "Prepare a single-use image upload.",
    description:
      'Reserve a 10-minute upload slot for a static image of at most 5 MiB and 16 megapixels. Outside the sandbox: curl --request PUT --header "Authorization: Bearer <returned token>" --header "Content-Type: <returned content type>" --data-binary @image.png "<uploadUrl>". Use the returned upload-only headers exactly, then call imageAttach with confirm: true. A {kind:"dataUrl",dataUrl,confirm:true} image field is the in-sandbox alternative. Do not log upload tokens.',
    input: imageUploadInput,
    output: imageUploadOutput,
    examples: [{ title: "Prepare PNG", input: { contentType: "image/png", size: 1024 } }],
    run: (_ctx, input) => prepareImageUpload(input, getOAuthIssuerUrl()),
  }),
  imageAttach: defineOperation({
    name: "imageAttach",
    area: "images",
    risk: "destructive",
    access: "admin",
    summary: "Attach a prepared image upload.",
    description:
      "Consume a ready, single-use upload and replace the entity image. Failed attachments preserve the upload for retry; replaced files are removed only when unreferenced. Requires confirm: true.",
    input: imageAttachInput,
    output: imageAttachedOutput,
    examples: [
      {
        title: "Attach cover",
        input: { type: "event", id: 1, role: "cover", confirm: true, uploadId: "a".repeat(32) },
      },
    ],
    run: (_ctx, input) => attachImage(input),
  }),
  imageClear: defineOperation({
    name: "imageClear",
    area: "images",
    risk: "destructive",
    access: "admin",
    summary: "Clear an entity image.",
    description:
      "Remove the stored cover/icon reference and delete its file when no other entity uses it. Requires confirm: true.",
    input: imageClearInput,
    output: z.object({ cleared: z.boolean() }).strict(),
    examples: [
      { title: "Clear cover", input: { type: "event", id: 1, role: "cover", confirm: true } },
    ],
    run: (_ctx, { confirm: _confirm, ...input }) => clearEntityImage(input),
  }),
  imageOrphansList: defineOperation({
    name: "imageOrphansList",
    area: "images",
    risk: "read",
    access: "admin",
    summary: "List staged orphan images.",
    description:
      "Return paginated staged files, total bytes, scan cursor, and report count. No scan or deletion runs.",
    input: orphanListInput,
    output: orphanListOutput,
    examples: [{ title: "Staged images", input: {} }],
    run: (_ctx, input) => getOrphanedImagesState(input),
  }),
  imageOrphansStage: defineOperation({
    name: "imageOrphansStage",
    area: "images",
    risk: "write",
    access: "admin",
    summary: "Scan and stage a batch of orphan images.",
    description:
      "Check a bounded batch against database references, persist the cursor and report, and stage unreferenced files. Does not delete images. dryRun avoids updating cursor/staging state.",
    input: orphanStageInput,
    output: orphanStageOutput,
    examples: [{ title: "Scan batch", input: { batchSize: 250 } }],
    run: (_ctx, input) => stageOrphanedImagesBatch({ ...input, useCursor: true }),
  }),
  imageOrphanDelete: defineOperation({
    name: "imageOrphanDelete",
    area: "images",
    risk: "destructive",
    access: "admin",
    summary: "Delete one staged orphan image.",
    description:
      "Recheck references and delete only a staged, unreferenced image. Paths are restricted to the staged images directory. Requires confirm: true.",
    input: orphanDeleteInput,
    output: orphanDeleteOutput,
    examples: [{ title: "Delete staged file", input: { path: "unused.webp", confirm: true } }],
    run: (_ctx, { path }) => deleteStagedOrphan(path),
  }),
  imageOrphansDeleteAll: defineOperation({
    name: "imageOrphansDeleteAll",
    area: "images",
    risk: "destructive",
    access: "admin",
    summary: "Delete all staged orphan images.",
    description:
      "Recheck references for every staged image and preserve newly referenced files. Requires confirm: true.",
    input: emptyInput.extend({ confirm }).strict(),
    output: orphanDeleteOutput,
    examples: [{ title: "Delete staged files", input: { confirm: true } }],
    run: () => deleteAllStagedOrphans(),
  }),
};
