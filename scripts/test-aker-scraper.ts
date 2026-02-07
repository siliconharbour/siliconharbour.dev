/**
 * Aker scraper smoke test
 *
 * Run with:
 *   pnpm tsx scripts/test-aker-scraper.ts
 *   pnpm tsx scripts/test-aker-scraper.ts "<careers-url>"
 */

import { scrapeAkerSolutions } from "../app/lib/job-importers/custom/aker-solutions";

const careersUrl = process.argv[2];

function hasNoisyTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes("deadline:") || lower.includes("position:") || lower.includes("st. john");
}

async function main() {
  const jobs = await scrapeAkerSolutions(careersUrl);

  console.log(`Fetched ${jobs.length} jobs`);
  console.log("");

  for (const [index, job] of jobs.entries()) {
    const noisy = hasNoisyTitle(job.title) ? " [NOISY TITLE]" : "";
    console.log(`${index + 1}. ${job.title}${noisy}`);
    console.log(`   location: ${job.location ?? "-"}`);
    console.log(`   url: ${job.url}`);
    console.log(`   externalId: ${job.externalId}`);
    console.log("");
  }

  const noisyCount = jobs.filter((job) => hasNoisyTitle(job.title)).length;
  if (noisyCount > 0) {
    console.error(`Found ${noisyCount} noisy title(s).`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
