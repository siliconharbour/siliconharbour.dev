import { expect, it, vi } from "vitest";
import { db, rawDb } from "~/db";
import { projectImages } from "~/db/schema";
import { operationCatalog as ops } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { getProjectImages } from "~/lib/projects.server";
import { action as editProject } from "~/routes/manage/projects/edit";

vi.mock("~/lib/session.server", () => ({
  requireAdmin: async () => ({ user: { id: 1, role: "admin" } }),
}));
const ctx = adminContext(1);
async function fixture() {
  const project = await ops.projectCreate.execute(ctx, {
    name: "Project",
    description: "Description",
  });
  const images = await db
    .insert(projectImages)
    .values(
      ["One", "Two", "Three"].map((caption, sortOrder) => ({
        projectId: project.id,
        image: `${caption}.webp`,
        caption,
        sortOrder,
      })),
    )
    .returning();
  return { project, images };
}

it("edits and clears captions through admin without replacing or moving the image", async () => {
  const { project, images } = await fixture();
  const image = images[1];
  const updated = await ops.projectGalleryUpdate.execute(ctx, {
    id: project.id,
    imageId: image.id,
    caption: "Updated",
  });
  expect(updated).toMatchObject({
    caption: "Updated",
    image: image.image,
    sortOrder: image.sortOrder,
    id: image.id,
  });
  const form = new FormData();
  form.set("intent", "updateGalleryImage");
  form.set("imageId", String(image.id));
  form.set("caption", "");
  await editProject({
    request: new Request("https://example.com/manage/projects/1", { method: "POST", body: form }),
    params: { id: String(project.id) },
  } as Parameters<typeof editProject>[0]);
  expect(await getProjectImages(project.id)).toEqual(
    images.map((row) => (row.id === image.id ? { ...row, caption: null } : row)),
  );
  await expect(
    ops.projectGalleryUpdate.execute(ctx, { id: 999, imageId: image.id, caption: "Wrong project" }),
  ).rejects.toThrow("not found");
  expect((await getProjectImages(project.id))[1].caption).toBeNull();
});

it("reorders through the admin action and rejects duplicate, missing and foreign images", async () => {
  const { project, images } = await fixture();
  const other = await ops.projectCreate.execute(ctx, { name: "Other", description: "Description" });
  const [foreign] = await db
    .insert(projectImages)
    .values({ projectId: other.id, image: "foreign.webp" })
    .returning();
  const empty = await ops.projectCreate.execute(ctx, { name: "Empty", description: "Description" });
  expect(await ops.projectGalleryReorder.execute(ctx, { id: empty.id, imageIds: [] })).toEqual([]);
  const ids = images.map((row) => row.id);
  const form = new FormData();
  form.set("intent", "reorderGallery");
  for (const id of [...ids].reverse()) form.append("imageIds", String(id));
  await editProject({
    request: new Request("https://example.com/manage/projects/1", { method: "POST", body: form }),
    params: { id: String(project.id) },
  } as Parameters<typeof editProject>[0]);
  const reordered = await getProjectImages(project.id);
  expect(reordered.map((row) => row.id)).toEqual([...ids].reverse());
  expect(reordered.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
  for (const imageIds of [
    [ids[0], ids[1]],
    [ids[0], ids[1], foreign.id],
    [ids[0], ids[0], ids[2]],
  ]) {
    await expect(
      ops.projectGalleryReorder.execute(ctx, { id: project.id, imageIds }),
    ).rejects.toThrow("exactly once");
    expect(await getProjectImages(project.id)).toEqual(reordered);
  }
  expect(await getProjectImages(other.id)).toEqual([foreign]);
  await expect(ops.projectGalleryReorder.execute(ctx, { id: 999, imageIds: [] })).rejects.toThrow(
    "not found",
  );
});

it("rolls back an earlier position update when a later database write fails", async () => {
  const { project, images } = await fixture();
  rawDb.exec(
    `CREATE TRIGGER fail_gallery_update BEFORE UPDATE OF sort_order ON project_images WHEN NEW.id = ${images[1].id} BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;`,
  );
  await expect(
    ops.projectGalleryReorder.execute(ctx, {
      id: project.id,
      imageIds: images.map((row) => row.id).reverse(),
    }),
  ).rejects.toThrow("simulated write failure");
  expect(await getProjectImages(project.id)).toEqual(images);
});
