import { existsSync } from "node:fs";
import { createPerson } from "./people.server";
import { createCompany } from "./companies.server";
import { unblockItem } from "./import-blocklist.server";
import { normalizeBlockKey } from "./import-blocklist-key";
import { getImagePath } from "./images.server";
import type { Person, Company } from "~/db/schema";

function retainedImage(filename: string | null) {
  return filename &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename) &&
    existsSync(getImagePath(filename))
    ? filename
    : null;
}
export async function restoreRejectedPerson(
  record: Pick<Person, "name" | "bio" | "website" | "github" | "socialLinks" | "avatar">,
) {
  if (record.github) await unblockItem("github", record.github);
  return createPerson({
    name: record.name,
    bio: record.bio,
    website: record.website,
    github: record.github,
    socialLinks: record.socialLinks,
    avatar: retainedImage(record.avatar),
    visible: false,
  });
}
export async function restoreRejectedCompany(
  record: Pick<
    Company,
    | "name"
    | "description"
    | "website"
    | "wikipedia"
    | "linkedin"
    | "github"
    | "email"
    | "careersUrl"
    | "location"
    | "founded"
    | "logo"
    | "coverImage"
    | "technl"
    | "genesis"
    | "bounce"
    | "newsFilterInclude"
  >,
  source?: string,
) {
  if (source) await unblockItem(source, normalizeBlockKey(source, record.website || record.name));
  return createCompany({
    ...record,
    logo: retainedImage(record.logo),
    coverImage: retainedImage(record.coverImage),
    visible: false,
  });
}
