/**
 * Coverage for the introspection helpers that drive the /api docs page,
 * the execute prompt's Types section, and the searchSpec variant lookup.
 *
 * These helpers walk the bridge's discriminated-union zod schemas and
 * the host()-wrapped function metadata, both of which would silently
 * drift from the implementation if introspection regressed. Pinning the
 * expected shape protects the agent-facing surface from invisible
 * breakage.
 */

import { describe, expect, it } from "vitest";
import {
  getEntitySchemaDocs,
  getHostFunctionDocs,
} from "~/mcp/bridge";

describe("getEntitySchemaDocs", () => {
  it("exposes the three discriminated unions in declaration order", () => {
    const docs = getEntitySchemaDocs();
    expect(docs.map((u) => u.unionName)).toEqual([
      "createEntity",
      "updateEntity",
      "reviewEntity",
    ]);
  });

  it("createEntity covers all 14 expected variants", () => {
    const docs = getEntitySchemaDocs();
    const create = docs.find((u) => u.unionName === "createEntity");
    expect(create).toBeDefined();
    const types = create!.variants.map((v) => v.type).sort();
    expect(types).toEqual(
      [
        "company",
        "education",
        "event",
        "event-source",
        "group",
        "job",
        "job-source",
        "news-article",
        "news-link",
        "news-source",
        "person",
        "product",
        "project",
        "technology",
      ].sort(),
    );
  });

  it("updateEntity covers the 13 updateable types", () => {
    const docs = getEntitySchemaDocs();
    const update = docs.find((u) => u.unionName === "updateEntity");
    expect(update).toBeDefined();
    const types = update!.variants.map((v) => v.type).sort();
    expect(types).toEqual(
      [
        "company",
        "education",
        "event",
        "event-source",
        "group",
        "job",
        "job-source",
        "news",
        "news-source",
        "person",
        "product",
        "project",
        "technology",
      ].sort(),
    );
  });

  it("reviewEntity covers job and news", () => {
    const docs = getEntitySchemaDocs();
    const review = docs.find((u) => u.unionName === "reviewEntity");
    expect(review).toBeDefined();
    expect(review!.variants.map((v) => v.type).sort()).toEqual(["job", "news"]);
  });

  it("splits required vs optional fields correctly for createEntity.person", () => {
    const docs = getEntitySchemaDocs();
    const person = docs[0].variants.find((v) => v.type === "person");
    expect(person).toBeDefined();
    expect(person!.required.map((f) => f.name).sort()).toEqual(["bio", "name"]);
    expect(person!.optional.map((f) => f.name).sort()).toEqual(
      ["github", "visible", "website"].sort(),
    );
  });

  it("renders zod enum values inline so the agent sees the choices", () => {
    const docs = getEntitySchemaDocs();
    const technology = docs[0].variants.find((v) => v.type === "technology");
    expect(technology).toBeDefined();
    const category = technology!.required.find((f) => f.name === "category");
    expect(category).toBeDefined();
    // The category enum lists every value separated by " | ".
    expect(category!.type).toContain("language");
    expect(category!.type).toContain("frontend");
    expect(category!.type).toContain("llm");
    expect(category!.type.split(" | ").length).toBeGreaterThanOrEqual(5);
  });

  it("renders updateEntity variants as id-required + all fields optional", () => {
    const docs = getEntitySchemaDocs();
    const personUpdate = docs[1].variants.find((v) => v.type === "person");
    expect(personUpdate).toBeDefined();
    expect(personUpdate!.required.map((f) => f.name)).toEqual(["id"]);
    // Every create-time field should be in optional now.
    expect(personUpdate!.optional.map((f) => f.name).sort()).toEqual(
      ["bio", "github", "name", "visible", "website"].sort(),
    );
  });

  it("reviewEntity job lists the full action enum (6 values)", () => {
    const docs = getEntitySchemaDocs();
    const jobReview = docs[2].variants.find((v) => v.type === "job");
    expect(jobReview).toBeDefined();
    const action = jobReview!.required.find((f) => f.name === "action");
    expect(action).toBeDefined();
    const values = action!.type.split(" | ");
    expect(values).toContain("approve");
    expect(values).toContain("approve-non-technical");
    expect(values).toContain("hide");
    expect(values).toContain("deactivate-removed");
    expect(values).toContain("deactivate-filled");
    expect(values).toContain("deactivate-expired");
  });

  it("returns deterministic output across calls", () => {
    const a = JSON.stringify(getEntitySchemaDocs());
    const b = JSON.stringify(getEntitySchemaDocs());
    expect(a).toBe(b);
  });
});

describe("getHostFunctionDocs", () => {
  it("returns 8 read functions and 27 execute functions", () => {
    const docs = getHostFunctionDocs();
    expect(docs.read).toHaveLength(8);
    expect(docs.execute).toHaveLength(27);
  });

  it("read surface is a strict subset of execute (execute mirrors read)", () => {
    const docs = getHostFunctionDocs();
    const readNames = new Set(docs.read.map((d) => d.name));
    const executeNames = new Set(docs.execute.map((d) => d.name));
    for (const name of readNames) {
      expect(executeNames.has(name), `execute should include read function "${name}"`).toBe(
        true,
      );
    }
  });

  it("every host function is documented — no undocumented entries leak", () => {
    const docs = getHostFunctionDocs();
    for (const entry of [...docs.read, ...docs.execute]) {
      expect(entry.status, `${entry.name} should be documented`).toBe("documented");
    }
  });

  it("exposes the union helpers in the execute surface", () => {
    const docs = getHostFunctionDocs();
    const names = new Set(docs.execute.map((d) => d.name));
    for (const fn of [
      "createEntity",
      "updateEntity",
      "deleteEntity",
      "getEntity",
      "listEntities",
      "syncSource",
      "syncAllSources",
      "asyncSyncAllSources",
      "reviewEntity",
    ]) {
      expect(names.has(fn), `execute must expose ${fn}`).toBe(true);
    }
  });

  it("each entry carries signature + description + category", () => {
    const docs = getHostFunctionDocs();
    for (const entry of docs.execute) {
      expect(entry.signature.length, `${entry.name} signature`).toBeGreaterThan(0);
      expect(entry.description.length, `${entry.name} description`).toBeGreaterThan(0);
      expect(entry.category.length, `${entry.name} category`).toBeGreaterThan(0);
    }
  });
});
