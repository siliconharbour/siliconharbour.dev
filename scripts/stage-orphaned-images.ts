import { stageOrphanedImagesBatch } from "../app/lib/image-orphans.server";

function parseNumberArg(args: string[], flag: string): number | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const raw = args[index + 1];
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value for ${flag}: ${raw}`);
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const batchSize = parseNumberArg(args, "--batch-size");
  const offset = parseNumberArg(args, "--offset");

  const dryRun = args.includes("--dry-run");
  const resetCursor = args.includes("--reset-cursor");
  const useCursor = !args.includes("--no-cursor");
  const verbose = args.includes("--verbose");

  const result = await stageOrphanedImagesBatch({
    batchSize,
    offset,
    dryRun,
    resetCursor,
    useCursor,
    verbose,
  });

  console.log(`Scanned ${result.scannedCount} images (${result.startOffset}..${result.endOffset - 1}).`);
  console.log(`Referenced: ${result.referencedCount}`);
  console.log(`Orphaned in batch: ${result.orphanCount}`);
  console.log(`Newly staged: ${result.newlyStagedCount}`);
  console.log(`Total staged: ${result.stagedTotal}`);
  console.log(`Next offset: ${result.nextOffset}`);
  if (result.reportPath) {
    console.log(`Report: ${result.reportPath}`);
  }
  if (dryRun) {
    console.log("Dry run mode: staged/cursor files were not modified.");
  } else {
    console.log(`Staged manifest: ${result.stagedPath}`);
    console.log(`Cursor file: ${result.cursorPath}`);
  }
}

main();
