# Vitest Testing Infrastructure

## Problem

Server-side business logic (entity reference resolution, organizer syncing, slug generation, etc.) has no automated tests. Bugs like the `resolveReference` ambiguity issue can only be verified by manually editing the production database and checking the UI. We need a testing foundation that lets us run functions against a real SQLite database and prove correctness.

## Scope

**In scope:**
- Vitest setup with path alias resolution (`~/`)
- In-memory SQLite database per test file with full schema applied
- Module mock for `~/db` so all server code uses the test database
- Initial test suite for `app/lib/references.server.ts` covering the `resolveReference` ambiguity bug
- `pnpm test` script

**Out of scope:**
- Component rendering tests (createRoutesStub / testing-library)
- Loader/action request-level tests
- E2E tests (Playwright/Cypress)
- CI pipeline integration

## Architecture

### Dependencies to install

```
vitest (devDependency)
```

No other testing dependencies needed. We're testing server functions directly — no DOM, no rendering. Vitest provides the test runner, assertions, and module mocking. `better-sqlite3` and `drizzle-orm` are already installed.

### File structure

```
vitest.config.ts              # Vitest config — extends vite path resolution
test/
  setup.ts                    # Global setup — mocks ~/db module
  helpers/
    test-db.ts                # createTestDb(), resetTestDb() — in-memory SQLite + schema
  lib/
    references.test.ts        # First test file — resolveReference + syncOrganizerReferences
```

### How it works

#### 1. `vitest.config.ts`

Separate config file (not merged into `vite.config.ts`) to avoid pulling in React Router / Tailwind / MDX plugins that aren't needed for server tests. Uses `vite-tsconfig-paths` for `~/` alias resolution.

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Each test file runs in its own worker for true isolation
    fileParallelism: true,
    // But within a file, tests run sequentially (shared DB state)
    sequence: { concurrent: false },
  },
});
```

#### 2. `test/helpers/test-db.ts` — Database factory

Creates a fresh in-memory SQLite database and applies the full schema by running all migration SQL files in order. This guarantees the test schema matches production exactly.

Key design decisions:

- **In-memory SQLite** (`:memory:`) — fast, disposable, no cleanup needed.
- **Run real migrations** — not a hand-written schema. Reads `drizzle/*.sql` files sorted by filename, splits on `--&gt; statement-breakpoint`, executes each statement. This way tests automatically pick up new migrations.
- **FTS5 virtual tables** — better-sqlite3 supports FTS5 natively, no special handling needed.
- **Export shape matches `~/db`** — returns `{ db, rawDb }` so the mock is a drop-in replacement.

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

function getMigrationStatements(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const statements: string[] = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    // Split on drizzle-kit's statement breakpoint marker
    const parts = sql.split("--> statement-breakpoint");
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed) statements.push(trimmed);
    }
  }
  return statements;
}

// Cache parsed migrations — they don't change during a test run
let cachedStatements: string[] | null = null;

export function createTestDb() {
  if (!cachedStatements) {
    cachedStatements = getMigrationStatements();
  }

  const sqlite = new Database(":memory:");
  // Apply all migrations
  for (const stmt of cachedStatements) {
    try {
      sqlite.exec(stmt);
    } catch (e) {
      // Some ALTER TABLE statements may fail on fresh DBs (column already exists
      // from a later CREATE TABLE). This is expected — migrations are incremental
      // but we're applying them to an empty DB. Silently skip known-harmless errors.
      const msg = String(e);
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        continue;
      }
      throw e;
    }
  }

  const db = drizzle(sqlite, { schema });
  return { db, rawDb: sqlite };
}
```

**Note on migration replay:** The 0000 migration creates tables from scratch. Later migrations ALTER them. Running them all in order on an empty DB works correctly because SQLite processes them sequentially. The error handling is defensive — in practice the migrations should apply cleanly.

#### 3. `test/setup.ts` — Module mock

Uses `vi.mock` to replace `~/db` with a test database that's recreated per test file. The mock is hoisted by vitest to run before any module imports.

```ts
import { vi, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";

// This holds the current test database
let currentDb: ReturnType<typeof createTestDb>;

// Mock the ~/db module — vitest hoists this above all imports
vi.mock("~/db", () => {
  return {
    get db() { return currentDb.db; },
    get rawDb() { return currentDb.rawDb; },
  };
});

// Fresh database for each test
beforeEach(() => {
  currentDb = createTestDb();
});
```

Using getters ensures that when test code does `import { db } from "~/db"`, it always reads the current test's database, not a stale reference.

#### 4. Test files

Tests import server functions normally. They seed data, call the function, and assert results. The `~/db` module is already mocked by setup.ts.

Example:

```ts
import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { events, groups, companies } from "~/db/schema";
import { resolveReference } from "~/lib/references.server";

describe("resolveReference", () => {
  it("resolves a group by exact name match", async () => {
    await db.insert(groups).values({
      name: "10am @ MUN",
      slug: "10am-mun",
      description: "A group",
      visible: true,
    });

    const result = await resolveReference("10am @ MUN");
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.reference.type).toBe("group");
      expect(result.reference.name).toBe("10am @ MUN");
    }
  });

  it("excludes hidden imported events from candidates", async () => {
    // Insert the group
    await db.insert(groups).values({
      name: "10am @ MUN",
      slug: "10am-mun",
      description: "",
      visible: true,
    });

    // Insert a real event with the same name (no import status)
    await db.insert(events).values({
      title: "10am @ MUN",
      slug: "10am-mun",
      description: "",
      link: "https://example.com",
    });

    // Insert hidden imported events with same title
    for (let i = 0; i < 5; i++) {
      await db.insert(events).values({
        title: "10am @ MUN",
        slug: `10am-mun-${i + 2}`,
        description: "",
        link: "https://example.com",
        importSourceId: 1, // doesn't need to exist for this test
        importStatus: "hidden",
      });
    }

    const result = await resolveReference("10am @ MUN");
    // Should resolve to the group, not be ambiguous
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.reference.type).toBe("group");
    }
  });
});
```

### Migration replay correctness

The migration files in `drizzle/` are the source of truth. Concerns and mitigations:

1. **Table creation order** — The 0000 migration creates tables with foreign keys. SQLite doesn't enforce FK constraints by default (requires `PRAGMA foreign_keys = ON`), so creation order doesn't matter for schema setup. We leave FK enforcement off during schema setup and optionally enable it for individual tests that care about referential integrity.

2. **FTS5 tables** — Created via `CREATE VIRTUAL TABLE ... USING fts5(...)`. better-sqlite3 includes FTS5 support, works in `:memory:` mode.

3. **Data migrations** — Some migration files contain DML (INSERT, UPDATE, DELETE for data fixes). These are harmless on an empty database — they'll affect zero rows.

### What this enables

With this foundation, any server function that touches the database can be tested:

- `resolveReference` / `resolveReferences` — reference resolution logic
- `syncOrganizerReferences` — organizer-to-entity linking
- `syncReferences` — wiki-link parsing + resolution
- `generateSlug` / `generateEventSlug` — slug generation + uniqueness
- Event/group/company CRUD functions
- Job import sync logic

### Future extensions

- **Loader/action tests** — Call loader functions directly with `new Request(...)` objects. The DB mock is already in place; just import the loader and call it.
- **Seed helpers** — Build up a library of `seedGroup()`, `seedEvent()`, etc. factory functions for common test data patterns.
- **CI integration** — Add `pnpm test` to the CI pipeline.
