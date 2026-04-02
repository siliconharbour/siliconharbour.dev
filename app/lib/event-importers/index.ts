/**
 * Event Importer Registry
 * Factory for getting the correct importer based on source type
 */

import type { EventImporter } from "./types";
import { lumaUserImporter } from "./luma-user.server";
import { technlImporter } from "./technl.server";
import { netbenefitImporter } from "./netbenefit.server";

const importers: Record<string, EventImporter> = {
  "luma-user": lumaUserImporter,
  "technl": technlImporter,
  "netbenefit": netbenefitImporter,
};

/**
 * Get an importer for the given source type
 * @throws Error if the source type is not supported
 */
export function getEventImporter(sourceType: string): EventImporter {
  const importer = importers[sourceType];
  if (!importer) {
    throw new Error(`No event importer found for source type: ${sourceType}`);
  }
  return importer;
}

/**
 * Check if a source type has an importer available
 */
export function hasEventImporter(sourceType: string): boolean {
  return sourceType in importers;
}

/**
 * Get list of all available source types
 */
export function getAvailableSourceTypes(): string[] {
  return Object.keys(importers);
}

// Re-export types for convenience
export * from "./types";
