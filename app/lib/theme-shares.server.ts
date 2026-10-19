import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { rawDb } from "~/db";
import {
  MAX_LOGO_BYTES,
  shareInputSchema,
  type ShareInput,
  type SharedTheme,
} from "~/theme/share-config";
import { themeSchema } from "~/theme/tokens";

const MAX_STORAGE = 200 * 1024 * 1024;
const MAX_SHARES = 10_000;
interface ShareRow {
  id: string;
  name: string;
  theme: string;
  logo: Buffer | null;
  logo_bytes: number;
  edit_key_hash: string;
  revision: number;
  created_at: number;
  updated_at: number;
  created_ip: string;
  updated_ip: string;
}
export function shareError(message: string, status: number): never {
  throw new Response(message, { status });
}
function getRow(id: string): ShareRow {
  if (!/^[a-f0-9]{32}$/.test(id)) return shareError("Theme share not found.", 404);
  const row = rawDb.prepare("SELECT * FROM theme_shares WHERE id = ?").get(id) as
    | ShareRow
    | undefined;
  if (!row) return shareError("Theme share not found.", 404);
  return row;
}
const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
function authorize(row: ShareRow, key: string | null) {
  if (
    !key ||
    !/^[a-f0-9]{64}$/.test(key) ||
    !timingSafeEqual(Buffer.from(hashKey(key), "hex"), Buffer.from(row.edit_key_hash, "hex"))
  )
    shareError("This browser cannot edit that share. Make a copy instead.", 403);
}
export function getThemeShare(id: string): SharedTheme {
  const row = getRow(id);
  const theme = themeSchema.parse(JSON.parse(row.theme));
  return {
    id: row.id,
    name: row.name,
    theme,
    revision: row.revision,
    updatedAt: row.updated_at,
    logo: row.logo
      ? {
          src: `data:image/png;base64,${row.logo.toString("base64")}`,
          hash: createHash("sha256")
            .update(`data:image/png;base64,${row.logo.toString("base64")}`)
            .digest("hex"),
          name: "Shared logo",
          width: row.logo.readUInt32BE(16),
          height: row.logo.readUInt32BE(20),
        }
      : null,
  };
}
async function normalizeLogo(input: ShareInput["logo"]): Promise<Buffer | null> {
  if (!input) return null;
  const bytes = Buffer.from(input.src.slice("data:image/png;base64,".length), "base64");
  if (
    bytes.length > MAX_LOGO_BYTES ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    shareError("Upload a PNG no larger than 512 KB.", 400);
  try {
    const image = sharp(bytes, { limitInputPixels: 1024 * 1024 });
    const metadata = await image.metadata();
    if (
      metadata.format !== "png" ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 1024 ||
      metadata.height > 1024 ||
      (metadata.pages ?? 1) > 1
    )
      shareError("Use a static PNG no larger than 1024 × 1024.", 400);
    const result = await image.png().toBuffer();
    if (result.length > MAX_LOGO_BYTES) shareError("The normalized logo exceeds 512 KB.", 400);
    return result;
  } catch (error) {
    if (error instanceof Response) throw error;
    return shareError("This PNG could not be read.", 400);
  }
}
export async function saveThemeShare(
  input: unknown,
  ip: string,
  owner?: { id: string; key: string | null },
) {
  const parsed = shareInputSchema.safeParse(input);
  if (!parsed.success)
    return shareError("Invalid theme, name or logo. Logos must be PNG files up to 512 KB.", 400);
  const data = parsed.data;
  if (owner) authorize(getRow(owner.id), owner.key);
  const logo = await normalizeLogo(data.logo);
  const editKey = owner ? undefined : randomBytes(32).toString("hex");
  const id = owner?.id ?? randomBytes(16).toString("hex");
  const now = Date.now();
  const write = rawDb.transaction(() => {
    const previous = owner ? getRow(id) : undefined;
    if (previous) {
      authorize(previous, owner!.key);
      if (data.revision !== previous.revision)
        shareError("This share has changed. Open its link to reload it, or make a copy.", 409);
    }
    const totals = rawDb
      .prepare("SELECT COUNT(*) AS count, COALESCE(SUM(logo_bytes), 0) AS bytes FROM theme_shares")
      .get() as { count: number; bytes: number };
    if (
      (!owner && totals.count >= MAX_SHARES) ||
      totals.bytes - (previous?.logo_bytes ?? 0) + (logo?.length ?? 0) > MAX_STORAGE
    )
      shareError(
        "Shared theme storage is full. Please try again after an admin cleans it up.",
        507,
      );
    if (previous)
      rawDb
        .prepare(
          "UPDATE theme_shares SET name=?, theme=?, logo=?, logo_bytes=?, revision=revision+1, updated_at=?, updated_ip=? WHERE id=?",
        )
        .run(data.name, JSON.stringify(data.theme), logo, logo?.length ?? 0, now, ip, id);
    else
      rawDb
        .prepare(
          "INSERT INTO theme_shares (id,name,theme,logo,logo_bytes,edit_key_hash,created_at,updated_at,created_ip,updated_ip) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          data.name,
          JSON.stringify(data.theme),
          logo,
          logo?.length ?? 0,
          hashKey(editKey!),
          now,
          now,
          ip,
          ip,
        );
    return getThemeShare(id);
  });
  return { share: write.immediate(), ...(editKey ? { editKey } : {}) };
}
export interface ThemeShareSummary {
  id: string;
  name: string;
  logoBytes: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
  createdIp: string;
  updatedIp: string;
}
export function listThemeShares(limit = 20, offset = 0) {
  const items = rawDb
    .prepare(
      "SELECT id,name,logo_bytes AS logoBytes,revision,created_at AS createdAt,updated_at AS updatedAt,created_ip AS createdIp,updated_ip AS updatedIp FROM theme_shares ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
    )
    .all(Math.min(100, Math.max(1, limit)), Math.max(0, offset)) as ThemeShareSummary[];
  const { count: total } = rawDb.prepare("SELECT COUNT(*) AS count FROM theme_shares").get() as {
    count: number;
  };
  return { items, total };
}
export function deleteThemeShare(id: string) {
  return { deleted: rawDb.prepare("DELETE FROM theme_shares WHERE id = ?").run(id).changes > 0 };
}
export function themeShareLogo(id: string): Buffer | null {
  return getRow(id).logo;
}
