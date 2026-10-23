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
    const trimmed = url.trim();
    const candidate =
      /^[^\s/:]+\.[^\s/]+/.test(trimmed) && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
        ? `https://${trimmed}`
        : trimmed;
    const parsed = new URL(candidate);
    return (
      parsed.hostname.replace(/^www\./, "").toLowerCase() +
      parsed.pathname.replace(/\/$/, "").toLowerCase()
    );
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Derive a stable external ID for a scraped company */
export function getExternalId(company: ScrapedCompany): string {
  return normalizeUrl(company.website || company.name);
}
