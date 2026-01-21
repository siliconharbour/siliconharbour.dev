import { execSync } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import * as readline from "readline";

const REMOTE_HOST = "jack@jackharrhy.dev";
const REMOTE_PATH = "~/cookie-ops/core/volumes/siliconharbour/";
const REMOTE_COMPOSE_DIR = "~/cookie-ops/core";
const SERVICE_NAME = "siliconharbour";
const LOCAL_DATA_PATH = "./data/";
const BACKUP_DIR = "./tmp/backup/";

type Mode = "sync" | "backup" | "migrate";

function getMode(): Mode {
  const arg = process.argv[2];
  if (arg === "backup") return "backup";
  if (arg === "migrate") return "migrate";
  return "sync";
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
}

function ssh(command: string, options?: { stdio?: "inherit" | "pipe" }): string {
  const result = execSync(`ssh ${REMOTE_HOST} "${command}"`, {
    stdio: options?.stdio ?? "pipe",
    encoding: "utf-8",
  });
  return result?.toString() ?? "";
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

function pushToRemote(sourcePath: string) {
  const dest = `${REMOTE_HOST}:${REMOTE_PATH}`;
  
  console.log(`Pushing from ${sourcePath} to ${dest}...`);
  console.log("");

  execSync(
    `rsync -avz --progress "${sourcePath}" "${dest}"`,
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

function runBackup(): string {
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
    return zipFile;
  } catch (error) {
    // Clean up on failure
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    console.error("Backup failed:", error);
    process.exit(1);
  }
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function stopContainer() {
  console.log(`Stopping ${SERVICE_NAME} container...`);
  ssh(`cd ${REMOTE_COMPOSE_DIR} && docker compose stop ${SERVICE_NAME}`, { stdio: "inherit" });
  console.log("Container stopped.");
}

function startContainer() {
  console.log(`Starting ${SERVICE_NAME} container...`);
  ssh(`cd ${REMOTE_COMPOSE_DIR} && docker compose start ${SERVICE_NAME}`, { stdio: "inherit" });
  console.log("Container started.");
}

function checkContainerStatus(): boolean {
  try {
    const result = ssh(`cd ${REMOTE_COMPOSE_DIR} && docker compose ps --format json ${SERVICE_NAME}`);
    if (result.includes('"State":"running"') || result.includes('"Status":"Up')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function runMigrate() {
  console.log("");
  console.log("=".repeat(60));
  console.log("  PRODUCTION DATABASE MIGRATION");
  console.log("=".repeat(60));
  console.log("");
  console.log("This will:");
  console.log("  1. Stop the production container");
  console.log("  2. Create a backup of the production database");
  console.log("  3. Pull the database locally");
  console.log("  4. Run migrations on the local copy");
  console.log("  5. Push the migrated database back to production");
  console.log("  6. Start the production container");
  console.log("");
  console.log("=".repeat(60));
  console.log("  WARNING: THIS WILL CAUSE DOWNTIME");
  console.log("=".repeat(60));
  console.log("");

  let answer = await prompt("Are you sure you want to continue? Type 'yes' to proceed: ");
  if (answer !== "yes") {
    console.log("Aborted.");
    process.exit(0);
  }

  console.log("");
  answer = await prompt("Have you tested these migrations locally? Type 'yes' to confirm: ");
  if (answer !== "yes") {
    console.log("Please test migrations locally first. Aborted.");
    process.exit(0);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("  STARTING MIGRATION PROCESS");
  console.log("=".repeat(60));
  console.log("");

  // Step 1: Check and stop container
  console.log("[1/6] Checking container status...");
  const isRunning = checkContainerStatus();
  if (isRunning) {
    console.log("Container is running. Stopping it now...");
    stopContainer();
  } else {
    console.log("Container is already stopped.");
  }
  console.log("");

  // Step 2: Create backup
  console.log("[2/6] Creating backup of production database...");
  const backupFile = runBackup();
  console.log(`Backup saved to: ${backupFile}`);
  console.log("");

  // Step 3: Pull to local
  console.log("[3/6] Pulling production data to local...");
  if (!existsSync(LOCAL_DATA_PATH)) {
    mkdirSync(LOCAL_DATA_PATH, { recursive: true });
  }
  sync(LOCAL_DATA_PATH);
  console.log("");

  // Step 4: Run migrations locally
  console.log("[4/6] Running migrations on local database...");
  try {
    execSync("npm run db:migrate", { stdio: "inherit" });
    console.log("Migrations completed successfully.");
  } catch (error) {
    console.error("");
    console.error("=".repeat(60));
    console.error("  MIGRATION FAILED!");
    console.error("=".repeat(60));
    console.error("");
    console.error("The migrations failed. Production data has NOT been modified.");
    console.error(`A backup is available at: ${backupFile}`);
    console.error("");
    
    const restart = await prompt("Do you want to restart the production container? Type 'yes': ");
    if (restart === "yes") {
      startContainer();
    }
    process.exit(1);
  }
  console.log("");

  // Step 5: Push back to production
  console.log("[5/6] Pushing migrated database back to production...");
  pushToRemote(LOCAL_DATA_PATH);
  console.log("");

  // Step 6: Start container
  console.log("[6/6] Starting production container...");
  startContainer();
  console.log("");

  console.log("=".repeat(60));
  console.log("  MIGRATION COMPLETE!");
  console.log("=".repeat(60));
  console.log("");
  console.log("Production database has been migrated and the service is running.");
  console.log(`Backup available at: ${backupFile}`);
  console.log("");
}

async function main() {
  const mode = getMode();

  if (mode === "migrate") {
    await runMigrate();
  } else if (mode === "backup") {
    runBackup();
  } else {
    runSync();
  }
}

main();
