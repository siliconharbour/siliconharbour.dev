import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { DATA_DIR, DB_PATH, IMAGES_DIR } from "./paths.server";

export type StageOrphanedImagesOptions = {
  batchSize?: number;
  offset?: number;
  useCursor?: boolean;
  resetCursor?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  dbPath?: string;
  imagesDir?: string;
  stageDir?: string;
};

export type CursorState = {
  nextOffset: number;
  totalImagesLastRun: number;
  updatedAt: string;
};

export type StagedOrphan = {
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

export function getOrphanedImagesState(input: { page?: number; pageSize?: number } = {}) {
  const stageDir = join(DATA_DIR, "orphaned-images");
  const cursorPath = join(stageDir, "cursor.json");
  const stagedPath = join(stageDir, "staged.json");
  const reportsDir = join(stageDir, "reports");
  const pageSize = Math.min(Math.max(Math.floor(input.pageSize ?? 48), 1), 200);
  const staged = readJsonFile<StagedOrphan[]>(stagedPath, []);
  const cursor = readJsonFile<CursorState | null>(cursorPath, null);
  const totalPages = Math.max(1, Math.ceil(staged.length / pageSize));
  const page = Math.min(Math.max(Math.floor(input.page ?? 1), 1), totalPages);
  const start = (page - 1) * pageSize;

  let reportCount = 0;
  try {
    reportCount = readdirSync(reportsDir, { withFileTypes: true }).filter((entry) =>
      entry.isFile(),
    ).length;
  } catch {
    // The reports directory is created on the first scan.
  }

  return {
    items: staged.slice(start, start + pageSize),
    stagedTotal: staged.length,
    stagedBytes: staged.reduce((total, entry) => total + entry.sizeBytes, 0),
    cursor,
    reportCount,
    page,
    pageSize,
    totalPages,
  };
}

export type DeleteStagedOrphansResult = {
  requestedCount: number;
  deletedCount: number;
  missingCount: number;
  referencedCount: number;
  remainingStagedCount: number;
};

type DeleteStagedOrphansOptions = {
  dbPath?: string;
  imagesDir?: string;
  stageDir?: string;
};

function deleteStagedOrphans(
  paths?: string[],
  input: DeleteStagedOrphansOptions = {},
): DeleteStagedOrphansResult {
  const dbPath = input.dbPath ?? DB_PATH;
  const imagesDir = input.imagesDir ?? IMAGES_DIR;
  const stageDir = input.stageDir ?? join(DATA_DIR, "orphaned-images");
  const stagedPath = join(stageDir, "staged.json");
  const staged = readJsonFile<StagedOrphan[]>(stagedPath, []);
  const selectedPaths = new Set(paths ?? staged.map((entry) => entry.path));
  const selected = staged.filter((entry) => selectedPaths.has(entry.path));
  const removedPaths = new Set<string>();
  const db = new Database(dbPath, { readonly: true });
  let deletedCount = 0;
  let missingCount = 0;
  let referencedCount = 0;

  try {
    const probes = buildProbes(db);
    for (const entry of selected) {
      const reference = findReferenceProbe(probes, entry.filename, entry.path);
      if (reference) {
        referencedCount++;
        continue;
      }

      const imagesRoot = resolve(imagesDir);
      const imagePath = resolve(imagesRoot, entry.path);
      if (imagePath === imagesRoot || !imagePath.startsWith(`${imagesRoot}${sep}`)) {
        throw new Error(`Invalid staged image path: ${entry.path}`);
      }
      if (existsSync(imagePath)) {
        unlinkSync(imagePath);
        deletedCount++;
      } else {
        missingCount++;
      }
      removedPaths.add(entry.path);
    }
  } finally {
    db.close();
  }

  const remaining = staged.filter((entry) => !removedPaths.has(entry.path));
  writeJsonFile(stagedPath, remaining);
  return {
    requestedCount: selected.length,
    deletedCount,
    missingCount,
    referencedCount,
    remainingStagedCount: remaining.length,
  };
}

export function deleteStagedOrphan(
  path: string,
  input: DeleteStagedOrphansOptions = {},
): DeleteStagedOrphansResult {
  return deleteStagedOrphans([path], input);
}

export function deleteAllStagedOrphans(
  input: DeleteStagedOrphansOptions = {},
): DeleteStagedOrphansResult {
  return deleteStagedOrphans(undefined, input);
}

export async function stageOrphanedImagesBatch(input: StageOrphanedImagesOptions = {}) {
  const options = {
    batchSize: input.batchSize ?? 250,
    offset: input.offset,
    useCursor: input.useCursor ?? true,
    resetCursor: input.resetCursor ?? false,
    dryRun: input.dryRun ?? false,
    verbose: input.verbose ?? false,
    dbPath: input.dbPath ?? DB_PATH,
    imagesDir: input.imagesDir ?? IMAGES_DIR,
    stageDir: input.stageDir ?? join(DATA_DIR, "orphaned-images"),
  };

  if (!Number.isFinite(options.batchSize) || options.batchSize <= 0) {
    throw new Error(`Invalid batch size: ${options.batchSize}`);
  }
  if (options.offset !== undefined && (!Number.isFinite(options.offset) || options.offset < 0)) {
    throw new Error(`Invalid offset: ${options.offset}`);
  }

  const cursorPath = join(options.stageDir, "cursor.json");
  const stagedPath = join(options.stageDir, "staged.json");
  const reportsDir = join(options.stageDir, "reports");

  mkdirSync(options.stageDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });

  const cursor = options.resetCursor ? null : readJsonFile<CursorState | null>(cursorPath, null);
  const db = new Database(options.dbPath, { readonly: true });

  try {
    const allImagePaths = listImageFiles(options.imagesDir);
    const totalImages = allImagePaths.length;
    const startOffset =
      options.offset ?? (options.useCursor && cursor ? Math.max(0, cursor.nextOffset) : 0);

    if (startOffset >= totalImages) {
      if (!options.dryRun) {
        writeJsonFile(cursorPath, {
          nextOffset: totalImages,
          totalImagesLastRun: totalImages,
          updatedAt: new Date().toISOString(),
        } satisfies CursorState);
      }

      return {
        scannedCount: 0,
        referencedCount: 0,
        orphanCount: 0,
        newlyStagedCount: 0,
        stagedTotal: readJsonFile<StagedOrphan[]>(stagedPath, []).length,
        startOffset,
        endOffset: startOffset,
        totalImages,
        nextOffset: totalImages,
        dryRun: options.dryRun,
        reportPath: null as string | null,
        stagedPath,
        cursorPath,
      };
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
    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const reportPath = join(
      reportsDir,
      `${timestamp}-batch-${startOffset}-${endOffset}${options.dryRun ? "-dryrun" : ""}.json`,
    );

    const report = {
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
      orphanBatchEntries,
    };

    if (!options.dryRun) {
      writeJsonFile(stagedPath, sortedStaged);
      writeJsonFile(cursorPath, {
        nextOffset,
        totalImagesLastRun: totalImages,
        updatedAt: new Date().toISOString(),
      } satisfies CursorState);
    }
    writeJsonFile(reportPath, report);

    return {
      scannedCount: report.scannedCount,
      referencedCount: report.referencedCount,
      orphanCount: report.orphanCount,
      newlyStagedCount: report.newlyStagedCount,
      stagedTotal: report.stagedTotal,
      startOffset,
      endOffset,
      totalImages,
      nextOffset,
      dryRun: options.dryRun,
      reportPath,
      stagedPath,
      cursorPath,
    };
  } finally {
    db.close();
  }
}
