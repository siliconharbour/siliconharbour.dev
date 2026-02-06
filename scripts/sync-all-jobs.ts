/**
 * Sync all job import sources
 * Run with: npx tsx scripts/sync-all-jobs.ts
 */

import { getAllImportSources, syncJobs } from "../app/lib/job-importers/sync.server";

async function main() {
  console.log("Fetching import sources...\n");
  
  const sources = await getAllImportSources();
  console.log(`Found ${sources.length} import sources\n`);
  
  for (const source of sources) {
    console.log(`\n=== Syncing source ${source.id}: ${source.sourceType}/${source.sourceIdentifier} ===`);
    
    try {
      const result = await syncJobs(source.id);
      
      if (result.success) {
        console.log(`Success!`);
        console.log(`  Added: ${result.added}`);
        console.log(`  Updated: ${result.updated}`);
        console.log(`  Removed: ${result.removed}`);
        console.log(`  Reactivated: ${result.reactivated}`);
        console.log(`  Total active: ${result.totalActive}`);
      } else {
        console.error(`Failed: ${result.error}`);
      }
    } catch (e) {
      console.error(`Error syncing source ${source.id}:`, e);
    }
  }
  
  console.log("\n=== Done ===");
}

main().catch(console.error);
