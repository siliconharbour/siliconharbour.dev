import { getCompanyById } from "~/lib/companies.server";
import { z } from "zod";
import { defineOperation } from "../define";
import { NotFoundError } from "../errors";
import { toPlain } from "../plain";
import { lookupInput, deleteInput, adminListInput } from "../fields";
import { productCreateInput, productUpdateInput } from "../contracts/products";
import { productOutput } from "../contracts/products";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProductById,
  getAllProducts,
} from "~/lib/products.server";
import { withEntityImages } from "~/lib/entity-images.server";

export const productOperations = {
  productList: defineOperation({
    name: "productList",
    area: "products",
    risk: "read",
    access: "admin",
    summary: "List products for administration.",
    description:
      "Return a bounded page including hidden records. Filter by query or visibility. Use productGet for one record.",
    input: adminListInput,
    output: z.array(productOutput),
    examples: [{ title: "First page", input: {} }],
    run: async (_context, input) => {
      const records = await getAllProducts();
      return toPlain(
        records
          .filter(
            (record) =>
              !input.query || record.name.toLowerCase().includes(input.query.toLowerCase()),
          )
          .slice(input.offset, input.offset + input.limit),
      );
    },
  }),
  productGet: defineOperation({
    name: "productGet",
    area: "products",
    risk: "read",
    access: "admin",
    summary: "Get one product.",
    description:
      "Return the stored record including hidden fields for administration. Throws when the record does not exist.",
    input: lookupInput,
    output: productOutput,
    examples: [{ title: "By ID", input: { id: 1 } }],
    run: async (_context, input) => {
      const record =
        input.id !== undefined
          ? await getProductById(input.id)
          : (await getAllProducts()).find((item) =>
              input.slug !== undefined
                ? item.slug === input.slug
                : item.name.toLowerCase() === input.name?.toLowerCase(),
            );
      if (!record) throw new NotFoundError("Product not found");
      return toPlain(record);
    },
  }),
  productCreate: defineOperation({
    name: "productCreate",
    area: "products",
    risk: "write",
    access: "admin",
    summary: "Create a product.",
    description:
      "Create the record through the shared service, derive its slug, and synchronize references. Optional images support upload, public URL, data URL, keep, or clear. ",
    input: productCreateInput,
    output: productOutput,
    examples: [{ title: "Create", input: { name: "Product", description: "Description" } }],
    run: async (_context, input) => {
      const { logo, coverImage, ...fields } = input;
      if (fields.companyId && !(await getCompanyById(fields.companyId)))
        throw new NotFoundError("Company not found");
      const result = await withEntityImages(
        { type: "product" },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = await createProduct({ ...fields, ...images });

          return record;
        },
      );
      return toPlain(result);
    },
  }),
  productUpdate: defineOperation({
    name: "productUpdate",
    area: "products",
    risk: "write",
    access: "admin",
    summary: "Update a product.",
    description:
      "Patch only supplied fields; empty patches and unknown keys fail. Renaming regenerates the slug and text changes synchronize references. Replaced or cleared images are removed only when unreferenced.",
    input: productUpdateInput,
    output: productOutput,
    examples: [{ title: "Rename", input: { id: 1, name: "Updated Product" } }],
    run: async (_context, input) => {
      const { id, logo, coverImage, ...fields } = input;
      if (!(await getProductById(id))) throw new NotFoundError("Product not found");
      if (fields.companyId && !(await getCompanyById(fields.companyId)))
        throw new NotFoundError("Company not found");
      const result = await withEntityImages(
        { type: "product", id },
        { icon: logo, cover: coverImage },
        async (images) => {
          const record = (await updateProduct(id, { ...fields, ...images }))!;

          return record;
        },
      );
      return toPlain(result);
    },
  }),
  productDelete: defineOperation({
    name: "productDelete",
    area: "products",
    risk: "destructive",
    access: "admin",
    summary: "Delete a product.",
    description:
      "Delete the record and clean up unreferenced images. Requires confirm: true. Returns the deleted record for review history.",
    input: deleteInput,
    output: z.object({ deleted: z.literal(true), record: productOutput }).strict(),
    examples: [{ title: "Delete", input: { id: 1, confirm: true } }],
    run: async (_context, input) => {
      const record = await getProductById(input.id);
      if (!record) throw new NotFoundError("Product not found");
      await deleteProduct(input.id);
      return { deleted: true as const, record: toPlain(record) };
    },
  }),
};
