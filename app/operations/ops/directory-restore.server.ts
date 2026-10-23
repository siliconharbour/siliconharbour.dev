import { z } from "zod";
import { defineOperation } from "../define";
import { ForbiddenError } from "../errors";
import { personOutput } from "../contracts/people";
import { companyOutput } from "../contracts/companies";
import { restoreRejectedPerson, restoreRejectedCompany } from "~/lib/directory-restore.server";
import { toPlain } from "../plain";

// The browser undo payload is not a durable server-side deletion record.
export const personRestoreRejected = defineOperation({
  name: "personRestoreRejected",
  area: "people",
  risk: "write",
  access: "admin",
  summary: "Restore a rejected person from the browser undo payload.",
  description:
    "Validate the saved record, remove its GitHub block, and recreate it hidden with a new identity. Deleted image files cannot be recovered.",
  input: z.object({ record: personOutput }).strict(),
  output: personOutput,
  examples: [],
  run: async (context, input) => {
    if (context.actor?.via !== "admin-ui")
      throw new ForbiddenError("Browser undo is not exposed over MCP");
    return toPlain(await restoreRejectedPerson(input.record));
  },
});
export const companyRestoreRejected = defineOperation({
  name: "companyRestoreRejected",
  area: "companies",
  risk: "write",
  access: "admin",
  summary: "Restore a rejected company from the browser undo payload.",
  description:
    "Validate the saved record, remove the supplied directory block, and recreate it hidden with a new identity. Deleted image files cannot be recovered.",
  input: z
    .object({ record: companyOutput, source: z.enum(["technl", "genesis", "bounce"]).optional() })
    .strict(),
  output: companyOutput,
  examples: [],
  run: async (context, input) => {
    if (context.actor?.via !== "admin-ui")
      throw new ForbiddenError("Browser undo is not exposed over MCP");
    return toPlain(await restoreRejectedCompany(input.record, input.source));
  },
});
