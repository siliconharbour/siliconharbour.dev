import { scrapeTechNL, scrapeGenesis, scrapeBounce } from "./scraper.server";
import type { DirectoryImportConfig } from "./directory-import.server";
export const directoryImportConfigs = {
  technl: {
    sourceKey: "technl",
    sourceFlag: "technl",
    sourceLabel: "TechNL",
    defaultLocation: null,
    scrapeFn: scrapeTechNL,
    includesEducation: true,
  },
  genesis: {
    sourceKey: "genesis",
    sourceFlag: "genesis",
    sourceLabel: "Genesis Centre",
    defaultLocation: "St. John's, NL",
    scrapeFn: scrapeGenesis,
  },
  bounce: {
    sourceKey: "bounce",
    sourceFlag: "bounce",
    sourceLabel: "Bounce Health Innovation",
    defaultLocation: "St. John's, NL",
    scrapeFn: scrapeBounce,
  },
} satisfies Record<string, DirectoryImportConfig>;
