import { openSqlite } from "../app/db/sqlite.server";
import { tmpdir } from "node:os";
import { REMOTE_HOST, quote, ssh } from "./production";
import { execSync, execFileSync } from "child_process";
import { existsSync, mkdirSync, rmSync, mkdtempSync, chmodSync } from "fs";
import { join } from "path";
import * as readline from "readline";

process.umask(0o077);

const REMOTE_PATH = "/home/jack/infra/hosts/mug/volumes/siliconharbour/";
const REMOTE_DB_FILE = "/home/jack/infra/hosts/mug/volumes/siliconharbour/siliconharbour.db";
const REMOTE_COMPOSE_DIR = "~/infra/hosts/mug";
const SERVICE_NAME = "siliconharbour";
const LOCAL_DATA_PATH = "./data/";
const LOCAL_DB_FILE = "./data/siliconharbour.db";
const BACKUP_DIR = "./tmp/backup/";

type Mode = "sync" | "backup" | "push";

function getMode(): Mode {
  const arg = process.argv[2];
  if (arg === "backup") return "backup";
  if (arg === "push") return "push";
  if (arg === undefined) return "sync";
  throw new Error(`Unknown sync mode: ${arg}. Use pnpm run migrate-prod for migrations.`);
}

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

function sync(destPath: string) {
  const database = join(destPath, "siliconharbour.db");
  if (["-wal", "-shm", "-journal"].some((suffix) => existsSync(database + suffix)))
    throw new Error(
      "Local SQLite sidecars are present. Close or recover the local database before pulling production data",
    );
  mkdirSync(destPath, { recursive: true });
  const snapshot = ssh("mktemp /tmp/siliconharbour-db.XXXXXXXX").trim();
  if (!/^\/tmp\/siliconharbour-db\.[A-Za-z0-9]{8}$/.test(snapshot))
    throw new Error("Unexpected remote snapshot path");
  try {
    ssh(`sudo -n sqlite3 -readonly ${quote(REMOTE_DB_FILE)} ${quote(`.backup ${snapshot}`)}`);
    execFileSync(
      "rsync",
      [
        "-avz",
        "--rsync-path=sudo -n rsync",
        "--exclude=siliconharbour.db*",
        "--exclude=backups/",
        `${REMOTE_HOST}:${REMOTE_PATH}`,
        destPath,
      ],
      { stdio: "inherit" },
    );
    execFileSync(
      "rsync",
      ["-avz", "--rsync-path=sudo -n rsync", `${REMOTE_HOST}:${snapshot}`, database],
      { stdio: "inherit" },
    );
    chmodSync(database, 0o600);
  } finally {
    ssh(`sudo -n rm -f ${quote(snapshot)}`);
  }
}

async function pushDatabaseToRemote() {
  const dir = mkdtempSync(join(tmpdir(), "siliconharbour-push-"));
  const snapshot = join(dir, "siliconharbour.db");
  const sqlite = openSqlite(LOCAL_DB_FILE, { readonly: true });
  try {
    await sqlite.backup(snapshot);
    chmodSync(snapshot, 0o600);
    // A stopped process may leave WAL files; recover and close them before replacing its DB.
    ssh(`sudo -n sqlite3 ${quote(REMOTE_DB_FILE)} 'PRAGMA wal_checkpoint(TRUNCATE);'`);
    ssh(
      `test ! -e ${quote(REMOTE_DB_FILE + "-wal")} && test ! -e ${quote(REMOTE_DB_FILE + "-shm")}`,
    );
    execFileSync(
      "rsync",
      ["-avz", "--rsync-path=sudo -n rsync", snapshot, `${REMOTE_HOST}:${REMOTE_DB_FILE}`],
      { stdio: "inherit" },
    );
  } finally {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  }
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
      { stdio: "inherit" },
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
  console.log(`Starting ${SERVICE_NAME} container with the latest image...`);
  ssh(`cd ${REMOTE_COMPOSE_DIR} && docker compose up -d --pull always ${SERVICE_NAME}`, {
    stdio: "inherit",
  });
  console.log("Container started with the latest image.");
}

function checkContainerStatus(): boolean {
  try {
    const result = ssh(
      `cd ${REMOTE_COMPOSE_DIR} && docker compose ps --format json ${SERVICE_NAME}`,
    );
    if (result.includes('"State":"running"') || result.includes('"Status":"Up')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function runPush() {
  console.log("");
  console.log("=".repeat(60));
  console.log("  PUSH LOCAL DATABASE TO PRODUCTION");
  console.log("=".repeat(60));
  console.log("");
  console.log("This will:");
  console.log("  1. Stop the production container (if running)");
  console.log("  2. Create a backup of the production database");
  console.log("  3. Push your local database to production");
  console.log("  4. Restart the production container (if it was running)");
  console.log("");
  console.log("=".repeat(60));
  console.log("  WARNING: THIS OVERWRITES PRODUCTION DATA");
  console.log("=".repeat(60));
  console.log("");

  if (!existsSync(LOCAL_DB_FILE)) {
    console.error(`Local database not found: ${LOCAL_DB_FILE}`);
    process.exit(1);
  }

  let answer = await prompt("Are you sure you want to continue? Type 'yes' to proceed: ");
  if (answer !== "yes") {
    console.log("Aborted.");
    process.exit(0);
  }

  answer = await prompt("Have you verified your local DB has the changes you want? Type 'yes': ");
  if (answer !== "yes") {
    console.log("Aborted.");
    process.exit(0);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("  STARTING PUSH PROCESS");
  console.log("=".repeat(60));
  console.log("");

  const wasRunning = checkContainerStatus();
  let backupFile = "";

  try {
    console.log("[1/4] Checking and stopping production container...");
    if (wasRunning) {
      stopContainer();
    } else {
      console.log("Container already stopped.");
    }
    console.log("");

    console.log("[2/4] Creating backup of production database...");
    backupFile = runBackup();
    console.log(`Backup saved to: ${backupFile}`);
    console.log("");

    console.log("[3/4] Pushing local database to production...");
    await pushDatabaseToRemote();
    console.log("");

    if (wasRunning) {
      console.log("[4/4] Restarting production container...");
      startContainer();
    } else {
      console.log("[4/4] Container was previously stopped; leaving it stopped.");
    }
    console.log("");
    console.log("=".repeat(60));
    console.log("  PUSH COMPLETE!");
    console.log("=".repeat(60));
    console.log(`Production backup available at: ${backupFile}`);
    console.log("");
  } catch (error) {
    console.error("");
    console.error("Push failed:", error);
    console.error("");
    if (backupFile) {
      console.error(`Backup is available at: ${backupFile}`);
    }

    if (wasRunning) {
      const restart = await prompt("Do you want to restart the production container? Type 'yes': ");
      if (restart === "yes") {
        startContainer();
      }
    }
    process.exit(1);
  }
}

async function main() {
  const mode = getMode();

  if (mode === "push") {
    await runPush();
  } else if (mode === "backup") {
    runBackup();
  } else {
    runSync();
  }
}

main();
