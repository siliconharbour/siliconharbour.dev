/**
 * Smoke tests for the bridge's discriminated-union dispatchers. One
 * happy-path per union variant we care about — enough to catch a
 * regression in the dispatch logic without paying for full per-host-fn
 * coverage. Failure here means an agent calling that union shape would
 * also fail.
 *
 * Each test creates a fresh buildExecuteFunctions() against a fresh
 * in-memory DB (the global beforeEach in test/setup.ts handles the DB
 * isolation).
 */

import { describe, expect, it } from "vitest";
import { buildExecuteFunctions } from "~/mcp/bridge";

type HostFns = ReturnType<typeof buildExecuteFunctions>;

function fns(): HostFns {
  return buildExecuteFunctions();
}

// Narrow the host fn return type for the assertions below.
async function call<T = Record<string, unknown>>(
  fn: HostFns[string],
  args: unknown,
): Promise<T> {
  return (await fn(args)) as T;
}

describe("createEntity dispatch", () => {
  it("creates a technology", async () => {
    const r = await call<{
      created: boolean;
      type: string;
      entity: { id: number; name: string; slug: string; visible: boolean };
    }>(fns().createEntity, {
      type: "technology",
      name: "Acme Lang",
      category: "language",
    });

    expect(r.created).toBe(true);
    expect(r.type).toBe("technology");
    expect(r.entity.name).toBe("Acme Lang");
    expect(r.entity.slug).toBe("acme-lang");
    // Defaults to hidden per the convention.
    expect(r.entity.visible).toBe(false);
  });

  it("creates a person with required fields and visible override", async () => {
    const r = await call<{
      created: boolean;
      entity: { id: number; slug: string; visible: boolean };
    }>(fns().createEntity, {
      type: "person",
      name: "Test Person",
      bio: "Some bio",
      visible: true,
    });

    expect(r.created).toBe(true);
    expect(r.entity.slug).toBe("test-person");
    expect(r.entity.visible).toBe(true);
  });

  it("creates a company with the create:false short-circuit on duplicate", async () => {
    const first = await call<{ created: boolean }>(fns().createEntity, {
      type: "company",
      name: "Dup Co",
    });
    expect(first.created).toBe(true);

    // Second call with same name should NOT error — the createEntity('company')
    // branch deliberately preserves the createCompany convention of
    // returning { created: false } when the name already exists.
    const second = await call<{ created: boolean; message: string }>(fns().createEntity, {
      type: "company",
      name: "Dup Co",
    });
    expect(second.created).toBe(false);
    expect(second.message).toContain("already exists");
  });

  it("rejects an unknown discriminator", async () => {
    await expect(
      fns().createEntity({ type: "alien-species", name: "X" }),
    ).rejects.toThrow();
  });

  it("rejects a variant with missing required fields", async () => {
    await expect(
      fns().createEntity({ type: "person", name: "Bio Missing" }),
    ).rejects.toThrow();
  });
});

describe("updateEntity dispatch", () => {
  it("patches a technology's description", async () => {
    const created = await call<{
      entity: { id: number };
    }>(fns().createEntity, {
      type: "technology",
      name: "Patch Me",
      category: "frontend",
    });

    const updated = await call<{ updated: boolean; type: string }>(fns().updateEntity, {
      type: "technology",
      id: created.entity.id,
      description: "Now described",
      visible: true,
    });
    expect(updated.updated).toBe(true);
    expect(updated.type).toBe("technology");

    const after = await call<{
      found: boolean;
      entity: { description: string | null; visible: boolean };
    }>(fns().getEntity, {
      type: "technology",
      by: "id",
      value: created.entity.id,
    });
    expect(after.found).toBe(true);
    expect(after.entity.description).toBe("Now described");
    expect(after.entity.visible).toBe(true);
  });

  it("throws when the target id does not exist", async () => {
    await expect(
      fns().updateEntity({ type: "person", id: 999_999, bio: "noop" }),
    ).rejects.toThrow();
  });

  it("patches a group (s-3e4a) — type previously unavailable", async () => {
    const created = await call<{ entity: { id: number } }>(fns().createEntity, {
      type: "group",
      name: "Update Me Group",
      description: "Initial description",
      visible: true,
    });

    const updated = await call<{ updated: boolean }>(fns().updateEntity, {
      type: "group",
      id: created.entity.id,
      website: "https://example.com",
      meetingFrequency: "Monthly",
    });
    expect(updated.updated).toBe(true);

    const after = await call<{ entity: { website: string; meetingFrequency: string } }>(
      fns().getEntity,
      { type: "group", by: "id", value: created.entity.id },
    );
    expect(after.entity.website).toBe("https://example.com");
    expect(after.entity.meetingFrequency).toBe("Monthly");
  });

  it("patches an event (s-3e4a) — type previously unavailable", async () => {
    const created = await call<{ entity: { id: number } }>(fns().createEntity, {
      type: "event",
      title: "Patchable Event",
      description: "Initial",
      link: "https://example.com",
      startDate: "2026-12-31",
    });

    const updated = await call<{ updated: boolean }>(fns().updateEntity, {
      type: "event",
      id: created.entity.id,
      location: "St. John's, NL",
      organizer: "Sample Organizer",
    });
    expect(updated.updated).toBe(true);

    const after = await call<{ entity: { location: string; organizer: string } }>(
      fns().getEntity,
      { type: "event", by: "id", value: created.entity.id },
    );
    expect(after.entity.location).toBe("St. John's, NL");
    expect(after.entity.organizer).toBe("Sample Organizer");
  });
});

describe("reviewEntity dispatch", () => {
  it("requeues a hidden imported job back to pending_review", async () => {
    const company = await call<{ entity: { id: number } }>(fns().createEntity, {
      type: "company",
      name: "Queue Me Co",
    });
    // The bridge action works on imported jobs, so seed one directly via the existing helper.
    const { db } = await import("~/db");
    const { jobs, jobImportSources } = await import("~/db/schema");
    const { eq } = await import("drizzle-orm");
    const now = new Date();
    const [source] = await db
      .insert(jobImportSources)
      .values({
        companyId: company.entity.id,
        sourceType: "greenhouse",
        sourceIdentifier: "queue-me",
        sourceUrl: "https://example.com/jobs",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const [job] = await db
      .insert(jobs)
      .values({
        companyId: company.entity.id,
        sourceId: source.id,
        sourceType: "imported",
        externalId: "ext-queue-me",
        slug: "queue-me-job",
        title: "Queue Me Job",
        status: "hidden",
        removedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const updated = await call<{ type: string; action: string }>(fns().reviewEntity, {
      type: "job",
      id: job.id,
      action: "requeue",
    });
    expect(updated.type).toBe("job");
    expect(updated.action).toBe("requeue");

    const [after] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(after.status).toBe("pending_review");
    expect(after.removedAt).toBeNull();
  });
});

describe("deleteEntity dispatch", () => {
  it("deletes a project and reports success", async () => {
    const created = await call<{ entity: { id: number } }>(fns().createEntity, {
      type: "project",
      name: "Doomed Project",
      description: "Will be deleted",
    });

    const r = await call<{ deleted: boolean; type: string; id: number }>(
      fns().deleteEntity,
      { type: "project", id: created.entity.id },
    );
    expect(r.deleted).toBe(true);
    expect(r.type).toBe("project");
    expect(r.id).toBe(created.entity.id);

    const lookup = await call<{ found: boolean }>(fns().getEntity, {
      type: "project",
      by: "id",
      value: created.entity.id,
    });
    expect(lookup.found).toBe(false);
  });

  it("supports the source-type variants added in s-a806", async () => {
    // We won't exhaustively exercise every source-type lib, but at least
    // verify the dispatch reaches each branch without throwing.
    // Each delete fn returns ok-ish even on missing id; we're verifying the
    // dispatch, not the lib behaviour.
    await expect(
      fns().deleteEntity({ type: "event-source", id: 999_999 }),
    ).resolves.toBeDefined();
    await expect(
      fns().deleteEntity({ type: "job-source", id: 999_999 }),
    ).resolves.toBeDefined();
    await expect(
      fns().deleteEntity({ type: "news-source", id: 999_999 }),
    ).resolves.toBeDefined();
  });

  it("rejects an unknown discriminator", async () => {
    await expect(
      fns().deleteEntity({ type: "comment", id: 1 }),
    ).rejects.toThrow();
  });
});

describe("getEntity dispatch", () => {
  it("looks up a company by name and by slug", async () => {
    await fns().createEntity({ type: "company", name: "Lookup Me Co" });

    const byName = await call<{ found: boolean; entity: { slug: string } }>(
      fns().getEntity,
      { type: "company", by: "name", value: "Lookup Me Co" },
    );
    expect(byName.found).toBe(true);
    expect(byName.entity.slug).toBe("lookup-me-co");

    const bySlug = await call<{ found: boolean; entity: { name: string } }>(
      fns().getEntity,
      { type: "company", by: "slug", value: "lookup-me-co" },
    );
    expect(bySlug.found).toBe(true);
    expect(bySlug.entity.name).toBe("Lookup Me Co");
  });

  it("returns found:false when the slug does not exist", async () => {
    const r = await call<{ found: boolean }>(fns().getEntity, {
      type: "person",
      by: "slug",
      value: "nobody-by-that-slug",
    });
    expect(r.found).toBe(false);
  });

  it("rejects by:'name' on a non-company type", async () => {
    const r = await call<{ found: boolean; message: string }>(fns().getEntity, {
      type: "person",
      by: "name",
      value: "anything",
    });
    expect(r.found).toBe(false);
    expect(r.message).toContain("name");
  });

  it("looks up an event by id and slug (s-3e4a)", async () => {
    // Reproduces the gap discovered while wiring TechNest on prod: prior to
    // this fix, getEntity rejected type:'event' with a zod discriminator error.
    const created = await call<{ created: boolean; entity: { id: number; slug: string } }>(
      fns().createEntity,
      {
        type: "event",
        title: "Lookup Event",
        description: "Sample event",
        link: "https://example.com",
        startDate: "2026-12-31",
      },
    );

    const byId = await call<{ found: boolean; entity: { title: string } }>(fns().getEntity, {
      type: "event",
      by: "id",
      value: created.entity.id,
    });
    expect(byId.found).toBe(true);
    expect(byId.entity.title).toBe("Lookup Event");

    const bySlug = await call<{ found: boolean; entity: { title: string } }>(fns().getEntity, {
      type: "event",
      by: "slug",
      value: created.entity.slug,
    });
    expect(bySlug.found).toBe(true);
    expect(bySlug.entity.title).toBe("Lookup Event");
  });

  it("returns found:false for source types missing the id", async () => {
    for (const type of ["event-source", "job-source", "news-source"] as const) {
      const r = await call<{ found: boolean }>(fns().getEntity, {
        type,
        by: "id",
        value: 999_999,
      });
      expect(r.found, `${type} missing should return found:false`).toBe(false);
    }
  });

  it("rejects by:'slug' on source types (id-only)", async () => {
    const r = await call<{ found: boolean; message: string }>(fns().getEntity, {
      type: "event-source",
      by: "slug",
      value: "anything",
    });
    expect(r.found).toBe(false);
    expect(r.message).toContain("only support by:'id'");
  });
});

describe("listEntities dispatch", () => {
  it("returns an array for the all-events default filter", async () => {
    const r = await fns().listEntities({ type: "event" });
    expect(Array.isArray(r)).toBe(true);
  });

  it("returns an array for filter:'pending' on each pendingable type", async () => {
    for (const type of ["job", "event", "news"] as const) {
      const r = await fns().listEntities({ type, filter: "pending" });
      expect(Array.isArray(r), `pending ${type}`).toBe(true);
    }
  });

  it("returns an array for each source-type listing", async () => {
    for (const type of ["event-source", "job-source", "news-source"] as const) {
      const r = await fns().listEntities({ type, filter: "all" });
      expect(Array.isArray(r), `${type} all`).toBe(true);
    }
  });
});

describe("reviewEntity dispatch", () => {
  it("throws on a non-existent job id rather than silently accepting", async () => {
    await expect(
      fns().reviewEntity({ type: "job", id: 999_999, action: "approve" }),
    ).rejects.toThrow();
  });

  it("rejects an action not in the discriminated enum", async () => {
    await expect(
      fns().reviewEntity({ type: "job", id: 1, action: "explode" }),
    ).rejects.toThrow();
  });

  it("rejects a type discriminator outside { job, news }", async () => {
    await expect(
      fns().reviewEntity({ type: "company", id: 1, action: "approve" }),
    ).rejects.toThrow();
  });
});
