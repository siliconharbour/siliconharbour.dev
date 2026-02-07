/**
 * Custom Job Importer - Dispatcher
 *
 * Routes to per-company scraper functions based on sourceIdentifier.
 * Each company has a custom scraper in ./custom/ that handles their
 * specific career page format (WordPress, Webflow, Squarespace, etc.)
 *
 * sourceIdentifier is the company slug (e.g., "strobeltek", "c-core")
 */

import type {
  JobImporter,
  ImportSourceConfig,
  FetchedJob,
  ValidationResult,
} from "./types";
import type { CustomScraper } from "./custom/utils";
import { scrapeStrobeltek } from "./custom/strobeltek";
import { scrapeCCore } from "./custom/c-core";
import { scrapeVirtualMarine } from "./custom/virtual-marine";
import { scrapeNetbenefit } from "./custom/netbenefit";
import { scrapeRutter } from "./custom/rutter";
import { scrapeCompusult } from "./custom/compusult";
import { scrapeEnaimco } from "./custom/enaimco";
import { scrapeTriware } from "./custom/triware";
import { scrapeFocusfs } from "./custom/focusfs";
import { scrapeBluedrop } from "./custom/bluedrop";
import { scrapeVish } from "./custom/vish";
import { scrapeAkerSolutions } from "./custom/aker-solutions";
import { scrapeDataFarms } from "./custom/data-farms";

/**
 * Registry of custom scrapers by company identifier
 */
const scrapers: Record<string, CustomScraper> = {
  strobeltek: () => scrapeStrobeltek(),
  "c-core": () => scrapeCCore(),
  "virtual-marine": () => scrapeVirtualMarine(),
  netbenefit: () => scrapeNetbenefit(),
  rutter: () => scrapeRutter(),
  compusult: () => scrapeCompusult(),
  enaimco: () => scrapeEnaimco(),
  triware: () => scrapeTriware(),
  focusfs: () => scrapeFocusfs(),
  bluedrop: () => scrapeBluedrop(),
  vish: (careersUrl: string) => scrapeVish(careersUrl),
  "aker-solutions": (careersUrl: string) => scrapeAkerSolutions(careersUrl),
  "data-farms": (careersUrl: string) => scrapeDataFarms(careersUrl),
};

export const customImporter: JobImporter = {
  sourceType: "custom",

  async fetchJobs(config: ImportSourceConfig): Promise<FetchedJob[]> {
    const scraper = scrapers[config.sourceIdentifier];
    if (!scraper) {
      throw new Error(
        `No custom scraper found for "${config.sourceIdentifier}". ` +
          `Available: ${Object.keys(scrapers).join(", ")}`
      );
    }

    return scraper(config.sourceUrl || "");
  },

  async validateConfig(
    config: Omit<ImportSourceConfig, "id">
  ): Promise<ValidationResult> {
    if (!config.sourceIdentifier || config.sourceIdentifier.trim() === "") {
      return {
        valid: false,
        error: `Company identifier required. Available: ${Object.keys(scrapers).join(", ")}`,
      };
    }

    const scraper = scrapers[config.sourceIdentifier];
    if (!scraper) {
      return {
        valid: false,
        error: `No custom scraper for "${config.sourceIdentifier}". Available: ${Object.keys(scrapers).join(", ")}`,
      };
    }

    try {
      const jobs = await scraper(config.sourceUrl || "");
      return {
        valid: true,
        jobCount: jobs.length,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
