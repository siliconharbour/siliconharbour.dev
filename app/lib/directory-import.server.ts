import type { ScrapedCompany } from "~/lib/scraper.server";

import { getAllCompanies } from "~/lib/companies.server";
import { getAllEducation } from "~/lib/education.server";

import { getBlockedExternalIds } from "~/lib/import-blocklist.server";
import { normalizeUrl } from "~/lib/directory-import";
import type { DirectoryImportLoaderData } from "~/lib/directory-import";

export { normalizeUrl } from "~/lib/directory-import";
export type { DirectoryImportLoaderData } from "~/lib/directory-import";

export interface DirectoryImportConfig {
  sourceKey: string;
  sourceFlag: "technl" | "genesis" | "bounce";
  sourceLabel: string;
  defaultLocation: string | null;
  scrapeFn: () => Promise<ScrapedCompany[]>;
  includesEducation?: boolean;
}

export async function buildDirectoryImportLoaderData(
  config: DirectoryImportConfig,
): Promise<DirectoryImportLoaderData> {
  const existingCompanies = await getAllCompanies(true); // include hidden

  const companyNames = new Set(existingCompanies.map((c) => c.name.toLowerCase()));
  const companyWebsites = new Set(
    existingCompanies.filter((c) => c.website).map((c) => normalizeUrl(c.website!)),
  );

  // Track which companies already have the source flag set
  const hasSourceFlagNames = new Set(
    existingCompanies.filter((c) => c[config.sourceFlag]).map((c) => c.name.toLowerCase()),
  );
  const hasSourceFlagWebsites = new Set(
    existingCompanies
      .filter((c) => c[config.sourceFlag] && c.website)
      .map((c) => normalizeUrl(c.website!)),
  );

  // Merge education institution names if this source includes them (TechNL)
  const existingNames = new Set(companyNames);
  if (config.includesEducation) {
    const existingEducation = await getAllEducation(true);
    for (const e of existingEducation) {
      existingNames.add(e.name.toLowerCase());
    }
    const educationWithFlag = existingEducation
      .filter((e) => e[config.sourceFlag])
      .map((e) => e.name.toLowerCase());
    for (const n of educationWithFlag) {
      hasSourceFlagNames.add(n);
    }
  }

  // Get blocked items
  const blockedIds = await getBlockedExternalIds(config.sourceKey);

  // Build lookup of existing company data for diff display, keyed by name AND website
  const existingCompanyData: DirectoryImportLoaderData["existingCompanyData"] = {};
  for (const c of existingCompanies) {
    const data = {
      website: c.website,
      description: c.description,
      email: c.email,
      logo: c.logo,
    };
    existingCompanyData[c.name.toLowerCase()] = data;
    if (c.website) {
      existingCompanyData[`website:${normalizeUrl(c.website)}`] = data;
    }
  }

  return {
    existingNames: Array.from(existingNames),
    existingWebsites: Array.from(companyWebsites),
    hasSourceFlagNames: Array.from(hasSourceFlagNames),
    hasSourceFlagWebsites: Array.from(hasSourceFlagWebsites),
    blockedIds: Array.from(blockedIds),
    existingCompanyData,
  };
}
