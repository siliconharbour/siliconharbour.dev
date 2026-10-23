import { z } from "zod";
import { defineOperation } from "../define";
import { emptyInput } from "../fields";
import { prepareSiteExport } from "~/lib/site-export.server";
export const exportOperations = {
  siteExport: defineOperation({
    name: "siteExport",
    area: "export",
    risk: "write",
    access: "admin",
    summary: "Prepare a site export download.",
    description:
      "Return a single-use download URL for the admin ZIP export, valid for five minutes. The URL grants download access; keep it private. Generate the export on redemption without fetching user-supplied URLs. Requires write scope because it grants access to the full private dataset.",
    input: emptyInput,
    output: z.object({ url: z.string(), expiresAt: z.iso.datetime() }).strict(),
    examples: [{ title: "Export site", input: {} }],
    run: (ctx) => prepareSiteExport(ctx.now()),
  }),
};
