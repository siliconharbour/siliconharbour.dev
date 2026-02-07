import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

type CliOptions = {
  batchSize: number;
  offset?: number;
  useCursor: boolean;
  resetCursor: boolean;
  dryRun: boolean;
  verbose: boolean;
  dbPath: string;
  imagesDir: string;
  stageDir: string;
};

type CursorState = {
  nextOffset: number;
  totalImagesLastRun: number;
  updatedAt: string;
};

type StagedOrphan = {
  path: string;
  filename: string;
  sizeBytes: number;
  stagedAt: string;
  reason: string;
};

type Probe = {
  source: string;
  statement: Database.Statement;
};

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
  ".avif",
  ".heic",
  ".heif",
]);

function parseArgs(): CliOptions {
  const defaults: CliOptions = {
    batchSize: 250,
    useCursor: true,
    resetCursor: false,
    dryRun: false,
    verbose: false,
    dbPath: join(process.cwd(), "data", "siliconharbour.db"),
    imagesDir: join(process.cwd(), "data", "images"),
    stageDir: join(process.cwd(), "data", "orphaned-images"),
  };

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--batch-size") {
      defaults.batchSize = Number(args[++i] ?? defaults.batchSize);
      continue;
    }
    if (arg === "--offset") {
      defaults.offset = Number(args[++i] ?? 0);
      continue;
    }
    if (arg === "--db") {
      defaults.dbPath = args[++i] ?? defaults.dbPath;
      continue;
    }
    if (arg === "--images-dir") {
      defaults.imagesDir = args[++i] ?? defaults.imagesDir;
      continue;
    }
    if (arg === "--stage-dir") {
      defaults.stageDir = args[++i] ?? defaults.stageDir;
      continue;
    }
    if (arg === "--reset-cursor") {
      defaults.resetCursor = true;
      continue;
    }
    if (arg === "--no-cursor") {
      defaults.useCursor = false;
      continue;
    }
    if (arg === "--dry-run") {
      defaults.dryRun = true;
      continue;
    }
    if (arg === "--verbose") {
      defaults.verbose = true;
      continue;
    }
  }

  if (!Number.isFinite(defaults.batchSize) || defaults.batchSize <= 0) {
    throw new Error(`Invalid --batch-size value: ${defaults.batchSize}`);
  }

  if (defaults.offset !== undefined && (!Number.isFinite(defaults.offset) || defaults.offset < 0)) {
    throw new Error(`Invalid --offset value: ${defaults.offset}`);
  }

  return defaults;
}

function listImageFiles(imagesDir: string): string[] {
  const files: string[] = [];
  const stack = [imagesDir];

  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(extension)) {
        files.push(fullPath);
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function sanitizeIdentifier(value: string): string {
  return value.replaceAll("`", "``");
}

function isLikelyTextColumn(type: string): boolean {
  const normalized = type.trim().toUpperCase();
  if (!normalized) {
    return true;
  }
  return normalized.includes("TEXT") || normalized.includes("CHAR") || normalized.includes("CLOB");
}

function buildProbes(db: Database.Database): Probe[] {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string }>;

  const probes: Probe[] = [];
  for (const { name: tableName } of tables) {
    const pragmaRows = db
      .prepare(`PRAGMA table_info(\`${sanitizeIdentifier(tableName)}\`)`)
      .all() as Array<{ name: string; type: string }>;

    for (const column of pragmaRows) {
      if (!isLikelyTextColumn(column.type)) {
        continue;
      }

      const escapedTable = sanitizeIdentifier(tableName);
      const escapedColumn = sanitizeIdentifier(column.name);
      const statement = db.prepare(
        `SELECT 1 FROM \`${escapedTable}\`
         WHERE \`${escapedColumn}\` = ?
            OR \`${escapedColumn}\` = ?
            OR \`${escapedColumn}\` = ?
            OR \`${escapedColumn}\` = ?
            OR \`${escapedColumn}\` LIKE ?
            OR \`${escapedColumn}\` LIKE ?
         LIMIT 1`,
      );

      probes.push({
        source: `${tableName}.${column.name}`,
        statement,
      });
    }
  }

  return probes;
}

function findReferenceProbe(
  probes: Probe[],
  fileBasename: string,
  relativePath: string,
): string | null {
  const normalizedRelative = relativePath.replaceAll("\\", "/");
  const exactPath = normalizedRelative;
  const publicPathByFile = `/images/${fileBasename}`;
  const publicPathByRelative = `/images/${normalizedRelative}`;
  const likeByFile = `%/${fileBasename}`;
  const likeByRelative = `%${normalizedRelative}`;

  for (const probe of probes) {
    const row = probe.statement.get(
      fileBasename,
      exactPath,
      publicPathByFile,
      publicPathByRelative,
      likeByFile,
      likeByRelative,
    ) as unknown;
    if (row) {
      return probe.source;
    }
  }

  return null;
}

function readJsonFile<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function main() {
  const options = parseArgs();
  const cursorPath = join(options.stageDir, "cursor.json");
  const stagedPath = join(options.stageDir, "staged.json");
  const reportsDir = join(options.stageDir, "reports");

  mkdirSync(options.stageDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });

  const cursor = options.resetCursor
    ? null
    : readJsonFile<CursorState | null>(cursorPath, null);
  const db = new Database(options.dbPath, { readonly: true });

  try {
    const allImagePaths = listImageFiles(options.imagesDir);
    const totalImages = allImagePaths.length;
    const startOffset =
      options.offset ?? (options.useCursor && cursor ? Math.max(0, cursor.nextOffset) : 0);

    if (startOffset >= totalImages) {
      const message = `Nothing to scan: offset ${startOffset} is at/after total images (${totalImages}).`;
      console.log(message);
      if (!options.dryRun) {
        writeJsonFile(cursorPath, {
          nextOffset: totalImages,
          totalImagesLastRun: totalImages,
          updatedAt: new Date().toISOString(),
        } satisfies CursorState);
      }
      return;
    }

    const endOffset = Math.min(totalImages, startOffset + options.batchSize);
    const batch = allImagePaths.slice(startOffset, endOffset);
    const probes = buildProbes(db);
    const stagedExisting = readJsonFile<StagedOrphan[]>(stagedPath, []);
    const stagedMap = new Map(stagedExisting.map((entry) => [entry.path, entry]));

    let referencedCount = 0;
    let orphanCount = 0;
    let newlyStagedCount = 0;
    const orphanBatchEntries: StagedOrphan[] = [];

    for (const absolutePath of batch) {
      const relativePath = relative(options.imagesDir, absolutePath).replaceAll("\\", "/");
      const filename = absolutePath.split("/").pop() ?? relativePath;
      const match = findReferenceProbe(probes, filename, relativePath);

      if (match) {
        referencedCount++;
        if (options.verbose) {
          console.log(`USED: ${relativePath} (found in ${match})`);
        }
        continue;
      }

      orphanCount++;
      const stagedEntry: StagedOrphan = {
        path: relativePath,
        filename,
        sizeBytes: statSync(absolutePath).size,
        stagedAt: new Date().toISOString(),
        reason: "No database references found in text columns",
      };
      orphanBatchEntries.push(stagedEntry);

      if (!stagedMap.has(relativePath)) {
        stagedMap.set(relativePath, stagedEntry);
        newlyStagedCount++;
      }

      if (options.verbose) {
        console.log(`ORPHAN: ${relativePath}`);
      }
    }

    const sortedStaged = [...stagedMap.values()].sort((a, b) => a.path.localeCompare(b.path));
    const nextOffset = endOffset;
    const summary = {
      scannedAt: new Date().toISOString(),
      dbPath: options.dbPath,
      imagesDir: options.imagesDir,
      range: { startOffset, endOffset, batchSize: options.batchSize, totalImages },
      scannedCount: batch.length,
      referencedCount,
      orphanCount,
      newlyStagedCount,
      nextOffset,
      stagedTotal: sortedStaged.length,
      dryRun: options.dryRun,
    };

    if (!options.dryRun) {
      writeJsonFile(stagedPath, sortedStaged);
      writeJsonFile(cursorPath, {
        nextOffset,
        totalImagesLastRun: totalImages,
        updatedAt: new Date().toISOString(),
      } satisfies CursorState);
    }

    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const reportPath = join(
      reportsDir,
      `${timestamp}-batch-${startOffset}-${endOffset}${options.dryRun ? "-dryrun" : ""}.json`,
    );
    writeJsonFile(reportPath, {
      ...summary,
      orphanBatchEntries,
    });

    console.log(`Scanned ${summary.scannedCount} images (${startOffset}..${endOffset - 1}).`);
    console.log(`Referenced: ${summary.referencedCount}`);
    console.log(`Orphaned in batch: ${summary.orphanCount}`);
    console.log(`Newly staged: ${summary.newlyStagedCount}`);
    console.log(`Total staged: ${summary.stagedTotal}`);
    console.log(`Next offset: ${summary.nextOffset}`);
    console.log(`Report: ${reportPath}`);
    if (options.dryRun) {
      console.log("Dry run mode: staged/cursor files were not modified.");
    } else {
      console.log(`Staged manifest: ${stagedPath}`);
      console.log(`Cursor file: ${cursorPath}`);
    }
  } finally {
    db.close();
  }
}

main();
