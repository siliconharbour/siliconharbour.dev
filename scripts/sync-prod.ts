import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const REMOTE_HOST = "jack@jackharrhy.dev";
const REMOTE_PATH = "~/cookie-ops/core/volumes/siliconharbour/";
const LOCAL_PATH = "./data/";

function syncProd() {
  // Ensure local data directory exists
  if (!existsSync(LOCAL_PATH)) {
    console.log(`Creating ${LOCAL_PATH} directory...`);
    mkdirSync(LOCAL_PATH, { recursive: true });
  }

  const source = `${REMOTE_HOST}:${REMOTE_PATH}`;
  
  console.log(`Syncing from ${source} to ${LOCAL_PATH}...`);
  console.log("");

  try {
    // rsync flags:
    // -a: archive mode (preserves permissions, timestamps, etc.)
    // -v: verbose
    // -z: compress during transfer
    // --progress: show progress
    // --delete: delete files in dest that don't exist in source
    execSync(
      `rsync -avz --progress "${source}" "${LOCAL_PATH}"`,
      { stdio: "inherit" }
    );

    console.log("");
    console.log("Sync completed successfully!");
  } catch (error) {
    console.error("Sync failed:", error);
    process.exit(1);
  }
}

syncProd();
