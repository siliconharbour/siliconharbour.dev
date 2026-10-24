import type { GitHubUser } from "./github.types";
import { fetchAvatar } from "./github.server";
import { createPerson, updatePerson, getPersonByGitHub, getPersonByName } from "./people.server";
import {
  findCompanyByFuzzyName,
  parseGitHubCompanyField,
  extractCompanyFromBio,
  updateCompany,
} from "./companies.server";
import { isBlocked } from "./import-blocklist.server";
import { processAndSaveIconImageWithPadding } from "./images.server";
import { deleteUnreferencedImages } from "./entity-images.server";
export async function importGithubProfiles(
  mode: "location" | "following",
  users: GitHubUser[],
  downloadAvatars: boolean,
) {
  const imported: string[] = [];
  const errors: string[] = [];
  for (const user of users) {
    const displayName = user.name || user.login;
    let avatar: string | null = null;
    try {
      if (await isBlocked("github", user.html_url)) {
        imported.push(`${displayName} (blocked)`);
        continue;
      }
      const existing =
        (await getPersonByGitHub(user.html_url)) ?? (await getPersonByName(displayName));
      if (existing && (mode === "following" || existing.github)) {
        imported.push(`${displayName} (skipped - already linked)`);
        continue;
      }
      let companyName: string | null = null;
      let githubOrgUrl: string | null = null;
      if (user.company) {
        const parsed = parseGitHubCompanyField(user.company);
        companyName = parsed.name;
        githubOrgUrl = parsed.githubOrg;
      }
      if (!companyName && user.bio) companyName = extractCompanyFromBio(user.bio);
      const company = companyName ? await findCompanyByFuzzyName(companyName) : null;
      const reference = company?.name || companyName;
      const location =
        user.location || (mode === "location" ? "Newfoundland & Labrador" : "unknown location");
      let bio = user.bio || "";
      if (reference && !bio.toLowerCase().includes(reference.toLowerCase()))
        bio = bio
          ? `${bio}\n\nWorks at [[${reference}]].`
          : `GitHub user from ${location}. Works at [[${reference}]].`;
      else if (!bio) bio = `GitHub user from ${location}.`;
      if (downloadAvatars && user.avatar_url && !existing?.avatar) {
        const bytes = await fetchAvatar(user.avatar_url);
        if (bytes) avatar = await processAndSaveIconImageWithPadding(bytes);
      }
      if (githubOrgUrl && company && !company.github)
        await updateCompany(company.id, { github: githubOrgUrl });
      if (existing) {
        await updatePerson(existing.id, {
          github: user.html_url,
          website: existing.website || user.blog || null,
          avatar: existing.avatar || avatar,
          bio: existing.bio?.startsWith("GitHub user from") ? bio : existing.bio,
        });
        imported.push(`${displayName} (merged${company ? `, linked to ${company.name}` : ""})`);
      } else {
        await createPerson({
          name: displayName,
          bio,
          website: user.blog || null,
          github: user.html_url,
          avatar,
          visible: false,
        });
        imported.push(`${displayName}${company ? ` (linked to ${company.name})` : ""}`);
      }
    } catch (error) {
      await deleteUnreferencedImages([avatar]);
      errors.push(`${displayName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { imported, errors };
}
