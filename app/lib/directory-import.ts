/**
 * Shared types and utilities for directory import pages.
 * This file is importable from both server and client code.
 */

import type { ScrapedCompany } from "~/lib/scraper.server";

export interface DirectoryImportLoaderData {
  existingNames: string[];
  existingWebsites: string[];
  hasSourceFlagNames: string[];
  hasSourceFlagWebsites: string[];
  blockedIds: string[];
  existingCompanyData: Record<
    string,
    {
      website: string | null;
      description: string;
      email: string | null;
      logo: string | null;
    }
  >;
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.replace(/^www\./, "").toLowerCase() +
      parsed.pathname.replace(/\/$/, "").toLowerCase()
    );
  } catch {
    return url.toLowerCase();
  }
}

/** Derive a stable external ID for a scraped company */
export function getExternalId(company: ScrapedCompany): string {
  return company.website
    ? normalizeUrl(company.website)
    : company.name.toLowerCase();
}
