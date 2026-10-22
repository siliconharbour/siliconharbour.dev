import { projectImageOutput } from "../contracts/directory-relations";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { projectGalleryAddInput, projectGalleryRemoveInput } from "../contracts/projects";
import {
  getProjectById,
  getProjectImages,
  addProjectImage,
  removeProjectImage,
} from "~/lib/projects.server";
import { withImageBytes, deleteUnreferencedImages } from "~/lib/entity-images.server";
import { processAndSaveCoverImage } from "~/lib/images.server";
import { toPlain } from "../plain";

export const projectGalleryOperations = {
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
        input: { id: 1, image: { kind: "url", url: "https://example.com/image.png" } },
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
      if (!(await getProjectImages(input.id)).some((image) => image.id === input.imageId))
        throw new NotFoundError("Project image not found");
      await removeProjectImage(input.imageId);
      return { deleted: true as const };
    },
  }),
};
