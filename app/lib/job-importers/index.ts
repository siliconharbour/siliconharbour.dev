/**
 * Job Importer Registry
 * Factory for getting the correct importer based on source type
 */

import type { JobImporter, JobSourceType } from "./types";
import { greenhouseImporter } from "./greenhouse.server";
import { ashbyImporter } from "./ashby.server";
import { workdayImporter } from "./workday.server";
import { bamboohrImporter } from "./bamboohr.server";
import { leverImporter } from "./lever.server";
import { collageImporter } from "./collage.server";
import { ripplingImporter } from "./rippling.server";

// Registry of all available importers
const importers: Record<string, JobImporter> = {
  greenhouse: greenhouseImporter,
  ashby: ashbyImporter,
  workday: workdayImporter,
  bamboohr: bamboohrImporter,
  lever: leverImporter,
  collage: collageImporter,
  rippling: ripplingImporter,
};

/**
 * Get an importer for the given source type
 * @throws Error if the source type is not supported
 */
export function getImporter(sourceType: JobSourceType): JobImporter {
  const importer = importers[sourceType];
  if (!importer) {
    throw new Error(`Unsupported job source type: ${sourceType}. Supported types: ${Object.keys(importers).join(", ")}`);
  }
  return importer;
}

/**
 * Check if a source type has an importer available
 */
export function hasImporter(sourceType: string): boolean {
  return sourceType in importers;
}

/**
 * Get list of all available source types
 */
export function getAvailableSourceTypes(): JobSourceType[] {
  return Object.keys(importers) as JobSourceType[];
}

// Re-export types for convenience
export * from "./types";
