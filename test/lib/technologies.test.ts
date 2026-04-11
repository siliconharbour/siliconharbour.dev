import { describe, it, expect } from "vitest";
import { db } from "~/db";
import { technologyAssignments } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createTechnology,
  updateTechnology,
  deleteTechnology,
  getTechnologyById,
  getTechnologyBySlug,
  assignTechnology,
  unassignTechnology,
  setTechnologiesForContent,
  getTechnologiesForContent,
} from "~/lib/technologies.server";

// =============================================================================
// Helper
// =============================================================================

async function makeTech(name: string, category: "language" | "frontend" | "backend" = "language") {
  return createTechnology({ name, category });
}

// =============================================================================
// CRUD
// =============================================================================

describe("technology CRUD", () => {
  it("creates a technology with auto-generated slug", async () => {
    const tech = await makeTech("TypeScript");

    expect(tech.id).toBeGreaterThan(0);
    expect(tech.name).toBe("TypeScript");
    expect(tech.slug).toBe("typescript");
    expect(tech.category).toBe("language");
  });

  it("reads a technology by id", async () => {
    const created = await makeTech("Go");
    const found = await getTechnologyById(created.id);

    expect(found).not.toBeNull();
    expect(found!.name).toBe("Go");
  });

  it("reads a technology by slug", async () => {
    await makeTech("Rust");
    const found = await getTechnologyBySlug("rust");

    expect(found).not.toBeNull();
    expect(found!.name).toBe("Rust");
  });

  it("returns null for non-existent id", async () => {
    const found = await getTechnologyById(99999);
    expect(found).toBeNull();
  });

  it("updates a technology", async () => {
    const created = await makeTech("Reat", "frontend");
    const updated = await updateTechnology(created.id, { name: "React" });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("React");
    expect(updated!.slug).toBe("react");
  });

  it("deletes a technology", async () => {
    const created = await makeTech("COBOL");
    const result = await deleteTechnology(created.id);
    expect(result).toBe(true);

    const found = await getTechnologyById(created.id);
    expect(found).toBeNull();
  });
});

// =============================================================================
// Assignments
// =============================================================================

describe("assignTechnology", () => {
  it("creates an assignment row", async () => {
    const tech = await makeTech("Python");
    const assignment = await assignTechnology(tech.id, "company", 1);

    expect(assignment.technologyId).toBe(tech.id);
    expect(assignment.contentType).toBe("company");
    expect(assignment.contentId).toBe(1);
  });

  it("is idempotent — re-assigning returns the existing row", async () => {
    const tech = await makeTech("Ruby");
    const first = await assignTechnology(tech.id, "company", 1);
    const second = await assignTechnology(tech.id, "company", 1);

    expect(second.id).toBe(first.id);
  });

  it("updates provenance on re-assign when provenance is provided", async () => {
    const tech = await makeTech("Elixir");
    await assignTechnology(tech.id, "company", 1);
    const updated = await assignTechnology(tech.id, "company", 1, {
      source: "Survey 2024",
      sourceUrl: "https://example.com/survey",
    });

    expect(updated.source).toBe("Survey 2024");
    expect(updated.sourceUrl).toBe("https://example.com/survey");
  });
});

describe("unassignTechnology", () => {
  it("removes an assignment row", async () => {
    const tech = await makeTech("Scala");
    await assignTechnology(tech.id, "company", 1);

    const result = await unassignTechnology(tech.id, "company", 1);
    expect(result).toBe(true);

    // Verify removal
    const rows = await db
      .select()
      .from(technologyAssignments)
      .where(
        and(
          eq(technologyAssignments.technologyId, tech.id),
          eq(technologyAssignments.contentType, "company"),
          eq(technologyAssignments.contentId, 1),
        ),
      );
    expect(rows).toHaveLength(0);
  });
});

// =============================================================================
// setTechnologiesForContent
// =============================================================================

describe("setTechnologiesForContent", () => {
  it("adds new, removes old, keeps existing", async () => {
    const [a, b, c] = await Promise.all([makeTech("Alpha"), makeTech("Beta"), makeTech("Gamma")]);

    // Start with A and B
    await setTechnologiesForContent("company", 1, [a.id, b.id]);

    let assignments = await db
      .select()
      .from(technologyAssignments)
      .where(
        and(
          eq(technologyAssignments.contentType, "company"),
          eq(technologyAssignments.contentId, 1),
        ),
      );
    expect(assignments.map((a) => a.technologyId).sort()).toEqual([a.id, b.id].sort());

    // Change to B and C — should remove A, keep B, add C
    await setTechnologiesForContent("company", 1, [b.id, c.id]);

    assignments = await db
      .select()
      .from(technologyAssignments)
      .where(
        and(
          eq(technologyAssignments.contentType, "company"),
          eq(technologyAssignments.contentId, 1),
        ),
      );
    const techIds = assignments.map((a) => a.technologyId).sort();
    expect(techIds).toEqual([b.id, c.id].sort());
  });

  it("is idempotent — running twice with same set causes no change", async () => {
    const [a, b] = await Promise.all([makeTech("Delta"), makeTech("Epsilon")]);

    await setTechnologiesForContent("project", 5, [a.id, b.id]);
    const firstRun = await db
      .select()
      .from(technologyAssignments)
      .where(
        and(
          eq(technologyAssignments.contentType, "project"),
          eq(technologyAssignments.contentId, 5),
        ),
      );

    await setTechnologiesForContent("project", 5, [a.id, b.id]);
    const secondRun = await db
      .select()
      .from(technologyAssignments)
      .where(
        and(
          eq(technologyAssignments.contentType, "project"),
          eq(technologyAssignments.contentId, 5),
        ),
      );

    // Same rows, same IDs
    expect(secondRun.map((r) => r.id).sort()).toEqual(firstRun.map((r) => r.id).sort());
  });
});

// =============================================================================
// getTechnologiesForContent
// =============================================================================

describe("getTechnologiesForContent", () => {
  it("returns assigned technologies with technology data", async () => {
    const [a, b] = await Promise.all([makeTech("Zeta", "frontend"), makeTech("Eta", "backend")]);

    await assignTechnology(a.id, "company", 10);
    await assignTechnology(b.id, "company", 10);

    const result = await getTechnologiesForContent("company", 10);

    expect(result).toHaveLength(2);
    // Sorted by technology name
    expect(result[0].technology.name).toBe("Eta");
    expect(result[1].technology.name).toBe("Zeta");
    // Each result has evidence array (empty since we didn't add any)
    expect(result[0].evidence).toEqual([]);
  });

  it("returns empty array when nothing assigned", async () => {
    const result = await getTechnologiesForContent("company", 999);
    expect(result).toEqual([]);
  });
});
