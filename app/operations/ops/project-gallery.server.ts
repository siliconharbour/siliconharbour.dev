import { projectGalleryUpdateInput, projectGalleryReorderInput } from "../contracts/projects";
import { updateProjectImage, reorderProjectImages } from "~/lib/projects.server";
import { projectImageOutput } from "../contracts/directory-relations";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { projectGalleryAddInput, projectGalleryRemoveInput } from "../contracts/projects";
import { getProjectById, addProjectImage, removeProjectImage } from "~/lib/projects.server";
import { withImageBytes, deleteUnreferencedImages } from "~/lib/entity-images.server";
import { processAndSaveCoverImage } from "~/lib/images.server";
import { toPlain } from "../plain";

export const projectGalleryOperations = {
  projectGalleryUpdate: defineOperation({
    name: "projectGalleryUpdate",
    area: "projects",
    risk: "write",
    access: "admin",
    summary: "Edit a project gallery caption.",
    description:
      "Update a caption without replacing the image or changing its position. Null or blank clears the caption. The image must belong to the supplied project; otherwise throws NotFound.",
    input: projectGalleryUpdateInput,
    output: projectImageOutput,
    examples: [
      { title: "Edit caption", input: { id: 1, imageId: 1, caption: "Project screenshot" } },
    ],
    run: async (_ctx, { id, imageId, caption }) => {
      const image = await updateProjectImage(id, imageId, { caption });
      if (!image) throw new NotFoundError("Project image not found");
      return toPlain(image);
    },
  }),
  projectGalleryReorder: defineOperation({
    name: "projectGalleryReorder",
    area: "projects",
    risk: "write",
    access: "admin",
    summary: "Reorder a project gallery.",
    description:
      "Supply every image ID belonging to the project exactly once in the desired order. Reject missing, duplicate or foreign IDs before writing. Persist consecutive positions in one transaction; images and captions stay unchanged. Empty galleries accept an empty array.",
    input: projectGalleryReorderInput,
    output: z.array(projectImageOutput),
    examples: [{ title: "Move image to front", input: { id: 1, imageIds: [2, 1] } }],
    run: async (_ctx, { id, imageIds }) => toPlain(reorderProjectImages(id, imageIds)),
  }),
  projectGalleryAdd: defineOperation({
    name: "projectGalleryAdd",
    area: "projects",
    risk: "write",
    access: "admin",
    summary: "Add a project gallery image.",
    description:
      "Accept a public image URL, a prepared upload, or a cropped data URL, normalize it to WebP, and append it with an optional caption. Use projectGalleryRemove to delete it.",
    input: projectGalleryAddInput,
    output: projectImageOutput,
    examples: [
      {
        title: "Add image",
        input: {
          id: 1,
          image: { kind: "url", confirm: true, url: "https://example.com/image.png" },
        },
      },
    ],
    run: async (_ctx, input) => {
      if (!(await getProjectById(input.id))) throw new NotFoundError("Project not found");
      return withImageBytes(input.image, async (bytes) => {
        const filename = await processAndSaveCoverImage(bytes);
        try {
          return toPlain(await addProjectImage(input.id, filename, input.caption));
        } catch (error) {
          await deleteUnreferencedImages([filename]);
          throw error;
        }
      });
    },
  }),
  projectGalleryRemove: defineOperation({
    name: "projectGalleryRemove",
    area: "projects",
    risk: "destructive",
    access: "admin",
    summary: "Remove a project gallery image.",
    description:
      "Remove only an image belonging to this project and delete the file when unreferenced. Requires confirm: true.",
    input: projectGalleryRemoveInput,
    output: z.object({ deleted: z.literal(true) }).strict(),
    examples: [{ title: "Remove image", input: { id: 1, imageId: 1, confirm: true } }],
    run: async (_ctx, input) => {
      if (!(await removeProjectImage(input.id, input.imageId)))
        throw new NotFoundError("Project image not found");
      return { deleted: true as const };
    },
  }),
};
