import { z } from "zod";
import { listInput } from "../listing";
const named = listInput(["name", "createdAt", "updatedAt"]);
const visible = named.extend({ visible: z.boolean().optional() }).strict();
export const directoryListInputs = {
  person: visible,
  company: visible.extend({ hasJobSource: z.boolean().optional() }).strict(),
  education: visible,
  technology: visible,
  group: visible,
  product: named,
  project: named,
};
