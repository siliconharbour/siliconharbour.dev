import { execSync } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const REMOTE_HOST = "jack@jackharrhy.dev";
const REMOTE_PATH = "~/cookie-ops/core/volumes/siliconharbour/";
const LOCAL_DATA_PATH = "./data/";
const BACKUP_DIR = "./tmp/backup/";

type Mode = "sync" | "backup";

function getMode(): Mode {
  const arg = process.argv[2];
  if (arg === "backup") return "backup";
  return "sync";
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
}

function sync(destPath: string) {
  const source = `${REMOTE_HOST}:${REMOTE_PATH}`;
  
  console.log(`Syncing from ${source} to ${destPath}...`);
  console.log("");

  // rsync flags:
  // -a: archive mode (preserves permissions, timestamps, etc.)
  // -v: verbose
  // -z: compress during transfer
  // --progress: show progress
  execSync(
    `rsync -avz --progress "${source}" "${destPath}"`,
    { stdio: "inherit" }
  );
}

function runSync() {
  // Ensure local data directory exists
  if (!existsSync(LOCAL_DATA_PATH)) {
    console.log(`Creating ${LOCAL_DATA_PATH} directory...`);
    mkdirSync(LOCAL_DATA_PATH, { recursive: true });
  }

  try {
    sync(LOCAL_DATA_PATH);
    console.log("");
    console.log("Sync completed successfully!");
  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}

function runBackup() {
  const timestamp = getTimestamp();
  const tempDir = join(BACKUP_DIR, `siliconharbour_${timestamp}`);
  const zipFile = join(BACKUP_DIR, `siliconharbour_${timestamp}.zip`);

  // Ensure backup directory exists
  if (!existsSync(BACKUP_DIR)) {
    console.log(`Creating ${BACKUP_DIR} directory...`);
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Create temp directory for this backup
  mkdirSync(tempDir, { recursive: true });

  try {
    // Sync to temp directory
    sync(tempDir);
    
    console.log("");
    console.log(`Creating archive: ${zipFile}...`);
    
    // Create zip archive
    execSync(
      `cd "${BACKUP_DIR}" && zip -r "siliconharbour_${timestamp}.zip" "siliconharbour_${timestamp}"`,
      { stdio: "inherit" }
    );

    // Clean up temp directory
    console.log("Cleaning up temp directory...");
    rmSync(tempDir, { recursive: true, force: true });

    console.log("");
    console.log(`Backup completed: ${zipFile}`);
  } catch (error) {
    // Clean up on failure
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    console.error("Backup failed:", error);
    process.exit(1);
  }
}

function main() {
  const mode = getMode();

  if (mode === "backup") {
    runBackup();
  } else {
    runSync();
  }
}

main();
