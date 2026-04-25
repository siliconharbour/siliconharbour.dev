/**
 * Shared server-side logic for directory import pages (TechNL, Genesis, etc.)
 *
 * Each directory import page follows the same pattern:
 * 1. Loader: build lookup sets of existing companies/education for duplicate detection
 * 2. Action: handle fetch, import, block, unblock, adopt-field intents
 *
 * This module extracts that shared logic so each route is a thin wrapper.
 */

import type { ScrapedCompany } from "~/lib/scraper.server";
import { fetchImage } from "~/lib/scraper.server";
import {
  createCompany,
  updateCompany,
  getAllCompanies,
  getCompanyByName,
  deleteCompany,
} from "~/lib/companies.server";
import {
  getAllEducation,
  getEducationByName,
  deleteEducation,
} from "~/lib/education.server";
import { processAndSaveIconImageWithPadding } from "~/lib/images.server";
import {
  getBlockedExternalIds,
  blockItem,
  unblockItem,
} from "~/lib/import-blocklist.server";
import { normalizeUrl } from "~/lib/directory-import";
import type { DirectoryImportLoaderData } from "~/lib/directory-import";

// Re-export shared types/utils so route files can import everything from one place
export { normalizeUrl } from "~/lib/directory-import";
export type { DirectoryImportLoaderData } from "~/lib/directory-import";

export interface DirectoryImportConfig {
  sourceKey: string; // "technl" | "genesis" -- blocklist source key
  sourceFlag: "technl" | "genesis"; // DB column to set
  sourceLabel: string; // "TechNL" | "Genesis Centre" -- display label
  defaultLocation: string | null; // null for technl, "St. John's, NL" for genesis
  scrapeFn: () => Promise<ScrapedCompany[]>;
  includesEducation?: boolean; // true for technl only
}

export async function buildDirectoryImportLoaderData(
  config: DirectoryImportConfig,
): Promise<DirectoryImportLoaderData> {
  const existingCompanies = await getAllCompanies(true); // include hidden

  const companyNames = new Set(
    existingCompanies.map((c) => c.name.toLowerCase()),
  );
  const companyWebsites = new Set(
    existingCompanies
      .filter((c) => c.website)
      .map((c) => normalizeUrl(c.website!)),
  );

  // Track which companies already have the source flag set
  const hasSourceFlagNames = new Set(
    existingCompanies
      .filter((c) => c[config.sourceFlag])
      .map((c) => c.name.toLowerCase()),
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
  const existingCompanyData: DirectoryImportLoaderData["existingCompanyData"] =
    {};
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

export async function handleDirectoryImportAction(
  request: Request,
  config: DirectoryImportConfig,
) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  // --- Block ---
  if (intent === "block") {
    const externalId = formData.get("externalId") as string;
    const name = formData.get("name") as string;

    if (externalId && name) {
      await blockItem(config.sourceKey, externalId, name);

      // Delete existing company with this name
      const existingCompany = await getCompanyByName(name);
      if (existingCompany) {
        await deleteCompany(existingCompany.id);
      }

      // Also delete education institution if this source tracks them
      if (config.includesEducation) {
        const existingEdu = await getEducationByName(name);
        if (existingEdu) {
          await deleteEducation(existingEdu.id);
        }
      }

      return { intent: "block", blocked: { externalId, name } };
    }
    return { intent: "block", error: "Missing externalId or name" };
  }

  // --- Unblock ---
  if (intent === "unblock") {
    const externalId = formData.get("externalId") as string;

    if (externalId) {
      await unblockItem(config.sourceKey, externalId);
      return { intent: "unblock", unblocked: externalId };
    }
    return { intent: "unblock", error: "Missing externalId" };
  }

  // --- Adopt field ---
  if (intent === "adopt-field") {
    const name = formData.get("name") as string;
    const field = formData.get("field") as string;
    const value = formData.get("value") as string;

    if (!name || !field || !value) {
      return { intent: "adopt-field", error: "Missing name, field, or value" };
    }

    const allowedFields = ["website", "description", "email"];
    if (!allowedFields.includes(field)) {
      return {
        intent: "adopt-field",
        error: `Field "${field}" is not adoptable`,
      };
    }

    let existing = await getCompanyByName(name);
    if (!existing) {
      // Company may have been renamed — try matching by website from form data
      const websiteValue = formData.get("companyWebsite") as string;
      if (websiteValue) {
        const allCompanies = await getAllCompanies(true);
        const normalizedWebsite = normalizeUrl(websiteValue);
        existing =
          allCompanies.find(
            (c) => c.website && normalizeUrl(c.website) === normalizedWebsite,
          ) ?? null;
      }
    }
    if (!existing) {
      return {
        intent: "adopt-field",
        error: `Company "${name}" not found`,
      };
    }

    await updateCompany(existing.id, { [field]: value });
    return { intent: "adopt-field", adopted: { name, field } };
  }

  // --- Fetch (scrape) ---
  if (intent === "fetch") {
    try {
      const scraped = await config.scrapeFn();
      return { intent: "fetch", companies: scraped, error: null };
    } catch (e) {
      return { intent: "fetch", companies: [], error: String(e) };
    }
  }

  // --- Import ---
  if (intent === "import") {
    const companiesJson = formData.get("companies") as string;
    const downloadLogos = formData.get("downloadLogos") === "true";

    try {
      const companies: ScrapedCompany[] = JSON.parse(companiesJson);
      const imported: string[] = [];
      const errors: string[] = [];

      for (const company of companies) {
        try {
          let logo: string | null = null;

          if (downloadLogos && company.logoUrl) {
            const imageBuffer = await fetchImage(company.logoUrl);
            if (imageBuffer) {
              logo = await processAndSaveIconImageWithPadding(imageBuffer);
            }
          }

          // Check if company already exists — by name first, then by website
          let existing = await getCompanyByName(company.name);
          if (!existing && company.website) {
            const allCompanies = await getAllCompanies(true);
            const normalizedWebsite = normalizeUrl(company.website);
            existing =
              allCompanies.find(
                (c) =>
                  c.website && normalizeUrl(c.website) === normalizedWebsite,
              ) ?? null;
          }

          if (existing) {
            // Just set the source flag — don't overwrite curated data
            await updateCompany(existing.id, {
              [config.sourceFlag]: true,
            });
            imported.push(
              `${existing.name} (marked ${config.sourceLabel})`,
            );
          } else {
            // Create new company (hidden by default, requires review)
            await createCompany({
              name: company.name,
              description: company.description || "",
              website: company.website,
              email: company.email,
              location: config.defaultLocation,
              logo,
              [config.sourceFlag]: true,
              visible: false,
            });
            imported.push(company.name);
          }
        } catch (e) {
          errors.push(`${company.name}: ${String(e)}`);
        }
      }

      return { intent: "import", imported, errors };
    } catch (e) {
      return { intent: "import", imported: [], errors: [String(e)] };
    }
  }

  return null;
}
