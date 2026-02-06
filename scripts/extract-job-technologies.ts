/**
 * Extract technologies from all job descriptions
 * Run with: npx tsx scripts/extract-job-technologies.ts
 */

import { extractTechnologiesFromAllJobs } from "../app/lib/job-importers/tech-extractor.server";

async function main() {
  console.log("Extracting technologies from job descriptions...\n");
  
  const result = await extractTechnologiesFromAllJobs();
  
  console.log(`Processed ${result.jobs} jobs`);
  console.log(`Found ${result.mentions} technology mentions`);
  console.log("\nDone!");
}

main().catch(console.error);
