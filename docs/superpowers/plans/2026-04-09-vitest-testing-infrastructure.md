# Vitest Testing Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up vitest with in-memory SQLite database isolation so server-side business logic can be tested, starting with the `resolveReference` ambiguity bug.

**Architecture:** Module-level `vi.mock("~/db")` swaps the database singleton with a fresh in-memory SQLite instance per test. Schema is applied by replaying migration SQL files from `drizzle/`. Tests import server functions directly and seed data before assertions.

**Tech Stack:** vitest, better-sqlite3 (already installed), drizzle-orm (already installed), vite-tsconfig-paths (already installed)

---

### Task 1: Install vitest and add test script

**Files:**
- Modify: `package.json` (devDependencies + scripts)

- [ ] **Step 1: Install vitest**

```bash
pnpm add -D vitest
```

- [ ] **Step 2: Add test script to package.json**

Add to the `"scripts"` section:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add vitest dependency and test scripts"
```

---

### Task 2: Create vitest config

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
  },
});
```

This is deliberately separate from `vite.config.ts` — we don't want React Router, Tailwind, or MDX plugins loading for server-side unit tests.

- [ ] **Step 2: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add vitest config with tsconfig path resolution"
```

---

### Task 3: Create the test database helper

**Files:**
- Create: `test/helpers/test-db.ts`

This is the core of the testing infrastructure. It creates a fresh in-memory SQLite database and applies all migration SQL files to produce the full schema.

- [ ] **Step 1: Create `test/helpers/test-db.ts`**

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../app/db/schema";
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

  for (const stmt of cachedStatements) {
    try {
      sqlite.exec(stmt);
    } catch (e) {
      // ALTER TABLE on fresh DB may hit "duplicate column" if a later migration
      // adds a column that a CREATE TABLE already includes. Safe to skip.
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

**Important:** The import uses a relative path `../../app/db/schema` instead of `~/db/schema` because this file is used inside `vi.mock` which resolves before path aliases. Using the relative path avoids circular resolution issues.

- [ ] **Step 2: Verify the helper works in isolation**

```bash
pnpm tsx -e "
const { createTestDb } = require('./test/helpers/test-db');
const { db } = createTestDb();
const result = db.select().from(require('./app/db/schema').groups).all();
console.log('Empty groups table:', result);
console.log('SUCCESS: test DB created with schema');
"
```

If this fails, the migration replay has issues that need debugging before proceeding.

- [ ] **Step 3: Commit**

```bash
git add test/helpers/test-db.ts
git commit -m "feat: add test database helper with migration replay"
```

---

### Task 4: Create the test setup file

**Files:**
- Create: `test/setup.ts`

This file is loaded by vitest before each test file. It mocks `~/db` to use an in-memory database and resets it before each test.

- [ ] **Step 1: Create `test/setup.ts`**

```ts
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
```

The `vi.mock` call is hoisted by vitest to run before any imports. The getters ensure that `import { db } from "~/db"` always reads the current test's database instance, even though the import binding is captured once. The `beforeEach` creates a fresh DB for every test — full isolation.

- [ ] **Step 2: Commit**

```bash
git add test/setup.ts
git commit -m "feat: add vitest setup with ~/db module mock"
```

---

### Task 5: Write the `resolveReference` test suite

**Files:**
- Create: `test/lib/references.test.ts`

This is the first real test file. It tests the exact bug scenario (hidden imported events causing ambiguous resolution) plus baseline behavior.

- [ ] **Step 1: Create `test/lib/references.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { events, groups, companies } from "~/db/schema";
import {
  resolveReference,
  syncOrganizerReferences,
} from "~/lib/references.server";

describe("resolveReference", () => {
  it("resolves a group by exact name match", async () => {
    await db.insert(groups).values({
      name: "Test Group",
      slug: "test-group",
      description: "A test group",
      visible: true,
    });

    const result = await resolveReference("Test Group");

    expect(result.resolved).toBe(true);
    expect(result).toMatchObject({
      resolved: true,
      reference: {
        type: "group",
        name: "Test Group",
        slug: "test-group",
      },
    });
  });

  it("resolves a company by exact name match", async () => {
    await db.insert(companies).values({
      name: "Acme Corp",
      slug: "acme-corp",
      description: "A company",
      visible: true,
    });

    const result = await resolveReference("Acme Corp");

    expect(result.resolved).toBe(true);
    expect(result).toMatchObject({
      resolved: true,
      reference: {
        type: "company",
        name: "Acme Corp",
      },
    });
  });

  it("resolves an event by exact title match", async () => {
    await db.insert(events).values({
      title: "Demo Night",
      slug: "demo-night",
      description: "",
      link: "https://example.com",
    });

    const result = await resolveReference("Demo Night");

    expect(result.resolved).toBe(true);
    expect(result).toMatchObject({
      resolved: true,
      reference: {
        type: "event",
        name: "Demo Night",
      },
    });
  });

  it("returns not_found for unknown names", async () => {
    const result = await resolveReference("Does Not Exist");

    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.reference.reason).toBe("not_found");
    }
  });

  it("excludes hidden imported events from candidates", async () => {
    await db.insert(groups).values({
      name: "10am @ MUN",
      slug: "10am-mun",
      description: "",
      visible: true,
    });

    // Hidden imported events with same title — should be excluded
    for (let i = 0; i < 5; i++) {
      await db.insert(events).values({
        title: "10am @ MUN",
        slug: `10am-mun-import-${i}`,
        description: "",
        link: "https://example.com",
        importStatus: "hidden",
      });
    }

    const result = await resolveReference("10am @ MUN");

    expect(result.resolved).toBe(true);
    expect(result).toMatchObject({
      resolved: true,
      reference: {
        type: "group",
        name: "10am @ MUN",
      },
    });
  });

  it("excludes pending_review imported events from candidates", async () => {
    await db.insert(groups).values({
      name: "Weekly Meetup",
      slug: "weekly-meetup",
      description: "",
      visible: true,
    });

    await db.insert(events).values({
      title: "Weekly Meetup",
      slug: "weekly-meetup-pending",
      description: "",
      link: "https://example.com",
      importStatus: "pending_review",
    });

    const result = await resolveReference("Weekly Meetup");

    expect(result.resolved).toBe(true);
    expect(result).toMatchObject({
      resolved: true,
      reference: { type: "group" },
    });
  });

  it("includes published imported events as candidates", async () => {
    await db.insert(events).values({
      title: "Published Event",
      slug: "published-event",
      description: "",
      link: "https://example.com",
      importStatus: "published",
    });

    const result = await resolveReference("Published Event");

    expect(result.resolved).toBe(true);
    expect(result).toMatchObject({
      resolved: true,
      reference: {
        type: "event",
        name: "Published Event",
      },
    });
  });

  it("prefers group over event when both share the same name", async () => {
    await db.insert(groups).values({
      name: "10am @ MUN",
      slug: "10am-mun",
      description: "",
      visible: true,
    });

    // A real event (no import status) with same name as the group
    await db.insert(events).values({
      title: "10am @ MUN",
      slug: "10am-mun-event",
      description: "",
      link: "https://example.com",
    });

    const result = await resolveReference("10am @ MUN");

    expect(result.resolved).toBe(true);
    expect(result).toMatchObject({
      resolved: true,
      reference: {
        type: "group",
        name: "10am @ MUN",
      },
    });
  });

  it("handles the full production scenario: group + real event + many hidden imports", async () => {
    // This replicates the exact production bug:
    // Group "10am @ MUN" exists
    // Recurring event "10am @ MUN" exists (no import status)
    // 21 hidden Luma imports with same title
    await db.insert(groups).values({
      name: "10am @ MUN",
      slug: "10am-mun",
      description: "",
      visible: true,
    });

    await db.insert(events).values({
      title: "10am @ MUN",
      slug: "10am-mun-event",
      description: "",
      link: "https://example.com",
    });

    for (let i = 0; i < 21; i++) {
      await db.insert(events).values({
        title: "10am @ MUN",
        slug: `10am-mun-${i + 2}`,
        description: "",
        link: "https://example.com",
        importStatus: "hidden",
      });
    }

    const result = await resolveReference("10am @ MUN");

    // Must resolve to group, not return ambiguous
    expect(result.resolved).toBe(true);
    expect(result).toMatchObject({
      resolved: true,
      reference: {
        type: "group",
        name: "10am @ MUN",
      },
    });
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm test
```

Expected: All tests pass. If the `vi.mock` path alias resolution has issues, see troubleshooting below.

**Troubleshooting:** If vitest can't resolve `~/db` inside `vi.mock`, the mock path may need to be the resolved filesystem path instead. Change `vi.mock("~/db", ...)` to use the resolved path:

```ts
import { resolve } from "path";
vi.mock(resolve(process.cwd(), "app/db/index.ts"), () => { ... });
```

Or alternatively, use `vi.mock("../../app/db/index", ...)` relative to the setup file. Experiment and use whichever works.

- [ ] **Step 3: Commit**

```bash
git add test/lib/references.test.ts
git commit -m "test: add resolveReference tests covering ambiguity bug with hidden imports"
```

---

### Task 6: Add syncOrganizerReferences tests

**Files:**
- Modify: `test/lib/references.test.ts`

These tests verify the full organizer sync pipeline — splitting comma-separated names, resolving each, and creating reference rows in the database.

- [ ] **Step 1: Add syncOrganizerReferences tests to `test/lib/references.test.ts`**

Append after the `resolveReference` describe block:

```ts
import { references } from "~/db/schema";
import { eq, and } from "drizzle-orm";

describe("syncOrganizerReferences", () => {
  it("creates a reference from event to group when organizer matches", async () => {
    const [group] = await db.insert(groups).values({
      name: "10am @ MUN",
      slug: "10am-mun",
      description: "",
      visible: true,
    }).returning();

    const [event] = await db.insert(events).values({
      title: "Demo Night",
      slug: "demo-night",
      description: "",
      link: "https://example.com",
      organizer: "10am @ MUN",
    }).returning();

    const result = await syncOrganizerReferences(event.id, "10am @ MUN");

    expect(result.resolved).toHaveLength(1);
    expect(result.unresolved).toHaveLength(0);
    expect(result.resolved[0].type).toBe("group");
    expect(result.resolved[0].id).toBe(group.id);

    // Verify the reference row was inserted
    const refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, event.id),
        ),
      );

    expect(refs).toHaveLength(1);
    expect(refs[0].targetType).toBe("group");
    expect(refs[0].targetId).toBe(group.id);
    expect(refs[0].relation).toBe("Organizer");
    expect(refs[0].field).toBe("organizer");
  });

  it("resolves multiple comma-separated organizers", async () => {
    const [group] = await db.insert(groups).values({
      name: "10am @ MUN",
      slug: "10am-mun",
      description: "",
      visible: true,
    }).returning();

    const [company] = await db.insert(companies).values({
      name: "Get Building",
      slug: "get-building",
      description: "",
      visible: true,
    }).returning();

    const [event] = await db.insert(events).values({
      title: "10am x Get Building Demo Night",
      slug: "10am-x-get-building-demo-night",
      description: "",
      link: "https://example.com",
      organizer: "10am @ MUN, Get Building",
    }).returning();

    const result = await syncOrganizerReferences(event.id, "10am @ MUN, Get Building");

    expect(result.resolved).toHaveLength(2);
    expect(result.unresolved).toHaveLength(0);

    const refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, event.id),
        ),
      );

    expect(refs).toHaveLength(2);

    const types = refs.map((r) => r.targetType).sort();
    expect(types).toEqual(["company", "group"]);
  });

  it("handles mix of resolved and unresolved organizers", async () => {
    await db.insert(groups).values({
      name: "10am @ MUN",
      slug: "10am-mun",
      description: "",
      visible: true,
    });

    const [event] = await db.insert(events).values({
      title: "Collab Event",
      slug: "collab-event",
      description: "",
      link: "https://example.com",
      organizer: "10am @ MUN, Some Unknown Org",
    }).returning();

    const result = await syncOrganizerReferences(event.id, "10am @ MUN, Some Unknown Org");

    expect(result.resolved).toHaveLength(1);
    expect(result.unresolved).toEqual(["Some Unknown Org"]);
  });

  it("deletes old organizer references before creating new ones", async () => {
    const [group] = await db.insert(groups).values({
      name: "Old Group",
      slug: "old-group",
      description: "",
      visible: true,
    }).returning();

    const [newGroup] = await db.insert(groups).values({
      name: "New Group",
      slug: "new-group",
      description: "",
      visible: true,
    }).returning();

    const [event] = await db.insert(events).values({
      title: "Test Event",
      slug: "test-event",
      description: "",
      link: "https://example.com",
      organizer: "Old Group",
    }).returning();

    // First sync — creates reference to Old Group
    await syncOrganizerReferences(event.id, "Old Group");

    let refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, event.id),
        ),
      );
    expect(refs).toHaveLength(1);
    expect(refs[0].targetId).toBe(group.id);

    // Second sync with different organizer — should replace
    await syncOrganizerReferences(event.id, "New Group");

    refs = await db
      .select()
      .from(references)
      .where(
        and(
          eq(references.sourceType, "event"),
          eq(references.sourceId, event.id),
        ),
      );
    expect(refs).toHaveLength(1);
    expect(refs[0].targetId).toBe(newGroup.id);
  });

  it("handles null organizer gracefully", async () => {
    const [event] = await db.insert(events).values({
      title: "No Organizer Event",
      slug: "no-organizer",
      description: "",
      link: "https://example.com",
    }).returning();

    const result = await syncOrganizerReferences(event.id, null);

    expect(result.resolved).toHaveLength(0);
    expect(result.unresolved).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/lib/references.test.ts
git commit -m "test: add syncOrganizerReferences tests for organizer-to-entity linking"
```

---

### Task 7: Final verification and quality gates

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

All tests should pass.

- [ ] **Step 2: Run lint**

```bash
pnpm run lint:fix
```

- [ ] **Step 3: Run build**

```bash
pnpm run build
```

Build should still pass — test files are not included in the app build.

- [ ] **Step 4: Final commit with spec**

```bash
git add docs/superpowers/specs/2026-04-09-vitest-testing-infrastructure-design.md docs/superpowers/plans/2026-04-09-vitest-testing-infrastructure.md
git commit -m "docs: add testing infrastructure spec and plan"
```
