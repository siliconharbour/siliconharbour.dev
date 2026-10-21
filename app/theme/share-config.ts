import { z } from "zod";
import { themeSchema } from "./tokens";

export const MAX_LOGO_BYTES = 512 * 1024;
export const MAX_LOGO_URL = Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 32;
export const logoSchema = z
  .object({
    src: z
      .string()
      .max(MAX_LOGO_URL)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().max(200),
    width: z.number().int().min(1).max(1024),
    height: z.number().int().min(1).max(1024),
  })
  .strict();
export const shareInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    theme: themeSchema,
    logo: logoSchema.nullable(),
    revision: z.number().int().min(1).optional(),
  })
  .strict();
export type ShareInput = z.infer<typeof shareInputSchema>;
export interface SharedTheme {
  id: string;
  name: string;
  theme: ShareInput["theme"];
  logo: ShareInput["logo"];
  revision: number;
  updatedAt: number;
}
