import { defineConfig } from "drizzle-kit";
import { DB_PATH } from "./app/lib/paths.server";

export default defineConfig({
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: DB_PATH,
  },
});
