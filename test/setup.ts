import { vi, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";

let currentDb: ReturnType<typeof createTestDb>;

vi.mock("~/db", () => {
  return {
    get db() {
      return currentDb.db;
    },
    get rawDb() {
      return currentDb.rawDb;
    },
  };
});

beforeEach(() => {
  currentDb = createTestDb();
});
