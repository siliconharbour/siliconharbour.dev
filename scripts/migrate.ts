import { parseArgs } from "node:util";
import { migrateFile } from "../app/db/migrate-file.server";
import { DB_PATH } from "../app/lib/paths.server";

const { values } = parseArgs({
  options: { existing: { type: "boolean", default: false }, "backup-dir": { type: "string" } },
});
try {
  const result = await migrateFile(DB_PATH, {
    existing: values.existing,
    backupDir: values["backup-dir"],
  });
  if (result.backupPath) console.log(`Database backup: ${result.backupPath}`);
  console.log(`Database migrations applied: ${result.applied}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database migration failed");
  process.exitCode = 1;
}
