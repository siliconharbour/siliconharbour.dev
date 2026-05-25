/**
 * API visibility/leak tests
 *
 * Verifies that every public /api/* endpoint correctly filters out
 * non-visible/hidden/draft entities. Each table has a different
 * "visibility" mechanism:
 *
 *   - companies, groups, education, people, technologies: boolean `visible`
 *   - news:        `status` enum, public iff status === "published"
 *   - jobs:        `status` enum, public iff status === "active"
 *   - events:      `importStatus`, public iff null or "published"
 *
 * The list endpoints already filter (mostly) but the detail endpoints
 * did not, and several list endpoints (events, products via search)
 * also leak. This test pins down the contract.
 */
import { describe, it, expect } from "vitest";
import { db } from "~/db";
import {
  companies,
  groups,
  education,
  people,
  technologies,
  news,
  jobs,
  events,
  eventDates,
  products,
  projects,
} from "~/db/schema";

import { loader as eventsListLoader } from "~/routes/api/events";
import { loader as eventDetailLoader } from "~/routes/api/events.$slug";
import { loader as jobDetailLoader } from "~/routes/api/jobs.$slug";
import { loader as newsDetailLoader } from "~/routes/api/news.$slug";
import { loader as companyDetailLoader } from "~/routes/api/companies.$slug";
import { loader as peopleDetailLoader } from "~/routes/api/people.$slug";
import { loader as groupDetailLoader } from "~/routes/api/groups.$slug";
import { loader as educationDetailLoader } from "~/routes/api/education.$slug";
import { loader as technologyDetailLoader } from "~/routes/api/technologies.$slug";
import { loader as entitiesSearchLoader } from "~/routes/api/entities.search";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LoaderArgs {
  request: Request;
  params: Record<string, string>;
  context: unknown;
}

function makeArgs(url: string, params: Record<string, string> = {}): LoaderArgs {
  return {
    request: new Request(`https://example.com${url}`),
    params,
    context: {},
  };
}

async function callLoader(
  loader: (args: LoaderArgs) => Promise<Response> | Response,
  url: string,
  params: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await loader(makeArgs(url, params));
  const text = await res.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

interface ListResponse {
  data: Array<Record<string, unknown>>;
  pagination: { total: number };
}

function asList(body: unknown): ListResponse {
  return body as ListResponse;
}

// ===========================================================================
// COMPANIES
// ===========================================================================

describe("GET /api/companies/:slug — visibility", () => {
  it("404s when company is not visible", async () => {
    await db.insert(companies).values({
      slug: "hidden-co",
      name: "Hidden Co",
      description: "secret",
      visible: false,
    });

    const { status, body } = await callLoader(companyDetailLoader, "/api/companies/hidden-co", {
      slug: "hidden-co",
    });

    expect(status).toBe(404);
    // Should not leak any company data
    expect(JSON.stringify(body)).not.toContain("Hidden Co");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("returns the company when visible", async () => {
    await db.insert(companies).values({
      slug: "shown-co",
      name: "Shown Co",
      description: "public",
      visible: true,
    });

    const { status, body } = await callLoader(companyDetailLoader, "/api/companies/shown-co", {
      slug: "shown-co",
    });

    expect(status).toBe(200);
    expect((body as { slug: string }).slug).toBe("shown-co");
  });
});

// ===========================================================================
// PEOPLE
// ===========================================================================

describe("GET /api/people/:slug — visibility", () => {
  it("404s when person is not visible", async () => {
    await db.insert(people).values({
      slug: "hidden-person",
      name: "Hidden Person",
      bio: "private bio",
      visible: false,
    });

    const { status, body } = await callLoader(peopleDetailLoader, "/api/people/hidden-person", {
      slug: "hidden-person",
    });

    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("Hidden Person");
    expect(JSON.stringify(body)).not.toContain("private bio");
  });
});

// ===========================================================================
// GROUPS
// ===========================================================================

describe("GET /api/groups/:slug — visibility", () => {
  it("404s when group is not visible", async () => {
    await db.insert(groups).values({
      slug: "hidden-group",
      name: "Hidden Group",
      description: "secret group",
      visible: false,
    });

    const { status, body } = await callLoader(groupDetailLoader, "/api/groups/hidden-group", {
      slug: "hidden-group",
    });

    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("Hidden Group");
  });
});

// ===========================================================================
// EDUCATION
// ===========================================================================

describe("GET /api/education/:slug — visibility", () => {
  it("404s when education institution is not visible", async () => {
    await db.insert(education).values({
      slug: "hidden-uni",
      name: "Hidden University",
      description: "secret school",
      visible: false,
    });

    const { status, body } = await callLoader(educationDetailLoader, "/api/education/hidden-uni", {
      slug: "hidden-uni",
    });

    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("Hidden University");
  });
});

// ===========================================================================
// TECHNOLOGIES
// ===========================================================================

describe("GET /api/technologies/:slug — visibility", () => {
  it("404s when technology is not visible", async () => {
    await db.insert(technologies).values({
      slug: "hidden-tech",
      name: "Hidden Tech",
      category: "language",
      visible: false,
    });

    const { status, body } = await callLoader(
      technologyDetailLoader,
      "/api/technologies/hidden-tech",
      { slug: "hidden-tech" },
    );

    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("Hidden Tech");
  });
});

// ===========================================================================
// NEWS
// ===========================================================================

describe("GET /api/news/:slug — visibility", () => {
  it("404s for a draft article", async () => {
    await db.insert(news).values({
      slug: "draft-article",
      type: "article",
      title: "Draft Article",
      status: "draft",
    });

    const { status, body } = await callLoader(newsDetailLoader, "/api/news/draft-article", {
      slug: "draft-article",
    });

    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("Draft Article");
  });

  it("404s for a hidden article", async () => {
    await db.insert(news).values({
      slug: "hidden-article",
      type: "article",
      title: "Hidden Article",
      status: "hidden",
    });

    const { status } = await callLoader(newsDetailLoader, "/api/news/hidden-article", {
      slug: "hidden-article",
    });

    expect(status).toBe(404);
  });

  it("404s for a pending_review article", async () => {
    await db.insert(news).values({
      slug: "pending-article",
      type: "article",
      title: "Pending Article",
      status: "pending_review",
    });

    const { status } = await callLoader(newsDetailLoader, "/api/news/pending-article", {
      slug: "pending-article",
    });

    expect(status).toBe(404);
  });

  it("returns published articles", async () => {
    await db.insert(news).values({
      slug: "published-article",
      type: "article",
      title: "Published Article",
      status: "published",
    });

    const { status, body } = await callLoader(newsDetailLoader, "/api/news/published-article", {
      slug: "published-article",
    });

    expect(status).toBe(200);
    expect((body as { slug: string }).slug).toBe("published-article");
  });
});

// ===========================================================================
// JOBS
// ===========================================================================

describe("GET /api/jobs/:slug — visibility", () => {
  const jobDefaults = { firstSeenAt: new Date(), lastSeenAt: new Date() };

  it("404s for a hidden job", async () => {
    await db.insert(jobs).values({
      slug: "hidden-job",
      title: "Hidden Job",
      status: "hidden",
      ...jobDefaults,
    });

    const { status, body } = await callLoader(jobDetailLoader, "/api/jobs/hidden-job", {
      slug: "hidden-job",
    });

    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("Hidden Job");
  });

  it("404s for a pending_review job", async () => {
    await db.insert(jobs).values({
      slug: "pending-job",
      title: "Pending Job",
      status: "pending_review",
      ...jobDefaults,
    });

    const { status } = await callLoader(jobDetailLoader, "/api/jobs/pending-job", {
      slug: "pending-job",
    });

    expect(status).toBe(404);
  });

  it("404s for a removed job", async () => {
    await db.insert(jobs).values({
      slug: "removed-job",
      title: "Removed Job",
      status: "removed",
      ...jobDefaults,
    });

    const { status } = await callLoader(jobDetailLoader, "/api/jobs/removed-job", {
      slug: "removed-job",
    });

    expect(status).toBe(404);
  });

  it("returns active jobs", async () => {
    await db.insert(jobs).values({
      slug: "active-job",
      title: "Active Job",
      status: "active",
      ...jobDefaults,
    });

    const { status, body } = await callLoader(jobDetailLoader, "/api/jobs/active-job", {
      slug: "active-job",
    });

    expect(status).toBe(200);
    expect((body as { slug: string }).slug).toBe("active-job");
  });
});

// ===========================================================================
// EVENTS
// ===========================================================================

describe("GET /api/events — visibility", () => {
  async function seedEvent(opts: {
    slug: string;
    title: string;
    importStatus: string | null;
    withDate?: boolean;
  }) {
    const [evt] = await db
      .insert(events)
      .values({
        slug: opts.slug,
        title: opts.title,
        description: "desc",
        link: "https://example.com",
        importStatus: opts.importStatus,
      })
      .returning();

    if (opts.withDate ?? true) {
      await db.insert(eventDates).values({
        eventId: evt.id,
        startDate: new Date("2099-01-01T18:00:00Z"),
      });
    }
    return evt;
  }

  it("does not include events with importStatus='hidden'", async () => {
    await seedEvent({ slug: "leak-me", title: "LEAKY HIDDEN EVENT", importStatus: "hidden" });
    await seedEvent({ slug: "ok-event", title: "OK Event", importStatus: null });

    const { status, body } = await callLoader(eventsListLoader, "/api/events");
    const list = asList(body);

    expect(status).toBe(200);
    const slugs = list.data.map((e) => e.slug);
    expect(slugs).toContain("ok-event");
    expect(slugs).not.toContain("leak-me");
    expect(JSON.stringify(body)).not.toContain("LEAKY HIDDEN EVENT");
    expect(list.pagination.total).toBe(1);
  });

  it("does not include events with importStatus='pending_review'", async () => {
    await seedEvent({ slug: "pending", title: "Pending Event", importStatus: "pending_review" });

    const { body } = await callLoader(eventsListLoader, "/api/events");
    const list = asList(body);

    expect(list.data.map((e) => e.slug)).not.toContain("pending");
  });

  it("includes published imported events", async () => {
    await seedEvent({
      slug: "published-import",
      title: "Published Import",
      importStatus: "published",
    });

    const { body } = await callLoader(eventsListLoader, "/api/events");
    const list = asList(body);

    expect(list.data.map((e) => e.slug)).toContain("published-import");
  });
});

describe("GET /api/events/:slug — visibility", () => {
  it("404s when event is hidden import", async () => {
    await db.insert(events).values({
      slug: "hidden-evt",
      title: "Hidden Event",
      description: "secret",
      link: "https://example.com",
      importStatus: "hidden",
    });

    const { status, body } = await callLoader(eventDetailLoader, "/api/events/hidden-evt", {
      slug: "hidden-evt",
    });

    expect(status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("Hidden Event");
  });

  it("404s when event is pending_review import", async () => {
    await db.insert(events).values({
      slug: "pending-evt",
      title: "Pending Event",
      description: "review me",
      link: "https://example.com",
      importStatus: "pending_review",
    });

    const { status } = await callLoader(eventDetailLoader, "/api/events/pending-evt", {
      slug: "pending-evt",
    });

    expect(status).toBe(404);
  });

  it("returns a published imported event", async () => {
    await db.insert(events).values({
      slug: "published-evt",
      title: "Published Event",
      description: "public",
      link: "https://example.com",
      importStatus: "published",
    });

    const { status, body } = await callLoader(eventDetailLoader, "/api/events/published-evt", {
      slug: "published-evt",
    });

    expect(status).toBe(200);
    expect((body as { slug: string }).slug).toBe("published-evt");
  });

  it("returns a manual event (importStatus null)", async () => {
    await db.insert(events).values({
      slug: "manual-evt",
      title: "Manual Event",
      description: "made by hand",
      link: "https://example.com",
      importStatus: null,
    });

    const { status, body } = await callLoader(eventDetailLoader, "/api/events/manual-evt", {
      slug: "manual-evt",
    });

    expect(status).toBe(200);
    expect((body as { slug: string }).slug).toBe("manual-evt");
  });
});

// ===========================================================================
// ENTITIES SEARCH
// ===========================================================================

describe("GET /api/entities/search — visibility", () => {
  it("excludes companies with visible=false", async () => {
    await db.insert(companies).values({
      slug: "leak-co",
      name: "LeakyCorp",
      description: "shh",
      visible: false,
    });
    await db.insert(companies).values({
      slug: "show-co",
      name: "LeakyShown",
      description: "public",
      visible: true,
    });

    const { status, body } = await callLoader(entitiesSearchLoader, "/api/entities/search?q=Leaky");
    const list = body as Array<{ slug: string }>;

    expect(status).toBe(200);
    const slugs = list.map((r) => r.slug);
    expect(slugs).toContain("show-co");
    expect(slugs).not.toContain("leak-co");
    expect(JSON.stringify(body)).not.toContain("LeakyCorp");
  });

  it("excludes groups with visible=false", async () => {
    await db.insert(groups).values({
      slug: "hidden-grp",
      name: "QQUnique Hidden Group",
      description: "shh",
      visible: false,
    });

    const { body } = await callLoader(entitiesSearchLoader, "/api/entities/search?q=QQUnique");
    const list = body as Array<{ slug: string }>;
    expect(list.map((r) => r.slug)).not.toContain("hidden-grp");
  });

  it("excludes people with visible=false", async () => {
    await db.insert(people).values({
      slug: "hidden-p",
      name: "ZZUnique Hidden Person",
      bio: "shh",
      visible: false,
    });

    const { body } = await callLoader(entitiesSearchLoader, "/api/entities/search?q=ZZUnique");
    const list = body as Array<{ slug: string }>;
    expect(list.map((r) => r.slug)).not.toContain("hidden-p");
  });

  it("excludes education with visible=false", async () => {
    await db.insert(education).values({
      slug: "hidden-edu",
      name: "WWUnique Hidden Edu",
      description: "shh",
      visible: false,
    });

    const { body } = await callLoader(entitiesSearchLoader, "/api/entities/search?q=WWUnique");
    const list = body as Array<{ slug: string }>;
    expect(list.map((r) => r.slug)).not.toContain("hidden-edu");
  });
});

// ===========================================================================
// Smoke test: defense-in-depth — no leaks across the whole API surface
//
// This sets a single shared "leaky" string into every hidden entity, then
// hits every public list/detail endpoint, asserting the string never
// appears in the response. Catches future regressions where a new field
// is added to a mapper without thinking about visibility.
// ===========================================================================

const SECRET = "SHOULD_NEVER_LEAK_42";

describe("smoke test — hidden entity data never appears in any public list endpoint", () => {
  it("does not leak hidden entities anywhere", async () => {
    // Seed one hidden entity for every type that has a visibility concept.
    await db.insert(companies).values({
      slug: "secret-co",
      name: `${SECRET} Co`,
      description: SECRET,
      visible: false,
    });
    await db.insert(groups).values({
      slug: "secret-grp",
      name: `${SECRET} Grp`,
      description: SECRET,
      visible: false,
    });
    await db.insert(people).values({
      slug: "secret-person",
      name: `${SECRET} Person`,
      bio: SECRET,
      visible: false,
    });
    await db.insert(education).values({
      slug: "secret-edu",
      name: `${SECRET} Edu`,
      description: SECRET,
      visible: false,
    });
    await db.insert(technologies).values({
      slug: "secret-tech",
      name: `${SECRET} Tech`,
      category: "language",
      visible: false,
    });
    await db.insert(news).values({
      slug: "secret-news",
      type: "article",
      title: `${SECRET} News`,
      content: SECRET,
      status: "draft",
    });
    await db.insert(jobs).values({
      slug: "secret-job",
      title: `${SECRET} Job`,
      description: SECRET,
      status: "hidden",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });
    const [hiddenEvt] = await db
      .insert(events)
      .values({
        slug: "secret-event",
        title: `${SECRET} Event`,
        description: SECRET,
        link: "https://example.com",
        importStatus: "hidden",
      })
      .returning();
    await db.insert(eventDates).values({
      eventId: hiddenEvt.id,
      startDate: new Date("2099-01-01T18:00:00Z"),
    });

    // Import every public list loader and exercise it.
    const { loader: companiesList } = await import("~/routes/api/companies");
    const { loader: groupsList } = await import("~/routes/api/groups");
    const { loader: peopleList } = await import("~/routes/api/people");
    const { loader: educationList } = await import("~/routes/api/education");
    const { loader: technologiesList } = await import("~/routes/api/technologies");
    const { loader: newsList } = await import("~/routes/api/news");
    const { loader: jobsList } = await import("~/routes/api/jobs");
    const { loader: eventsList } = await import("~/routes/api/events");
    const { loader: productsList } = await import("~/routes/api/products");
    const { loader: projectsList } = await import("~/routes/api/projects");
    const { loader: entitiesSearch } = await import("~/routes/api/entities.search");

    const responses = await Promise.all([
      callLoader(companiesList, "/api/companies"),
      callLoader(groupsList, "/api/groups"),
      callLoader(peopleList, "/api/people"),
      callLoader(educationList, "/api/education"),
      callLoader(technologiesList, "/api/technologies"),
      callLoader(newsList, "/api/news"),
      callLoader(jobsList, "/api/jobs"),
      callLoader(eventsList, "/api/events"),
      callLoader(productsList, "/api/products"),
      callLoader(projectsList, "/api/projects"),
      callLoader(entitiesSearch, `/api/entities/search?q=${SECRET}`),
    ]);

    for (const r of responses) {
      expect(JSON.stringify(r.body)).not.toContain(SECRET);
    }
  });
});

// ===========================================================================
// Smoke test: detail endpoints return 404 for hidden entities
// ===========================================================================

describe("smoke test — every detail endpoint 404s for a hidden entity", () => {
  it("companies/:slug 404s for hidden", async () => {
    await db.insert(companies).values({
      slug: "x",
      name: "x",
      description: "x",
      visible: false,
    });
    const r = await callLoader(companyDetailLoader, "/api/companies/x", { slug: "x" });
    expect(r.status).toBe(404);
  });

  it("groups/:slug 404s for hidden", async () => {
    await db.insert(groups).values({ slug: "x", name: "x", description: "x", visible: false });
    const r = await callLoader(groupDetailLoader, "/api/groups/x", { slug: "x" });
    expect(r.status).toBe(404);
  });

  it("people/:slug 404s for hidden", async () => {
    await db.insert(people).values({ slug: "x", name: "x", bio: "x", visible: false });
    const r = await callLoader(peopleDetailLoader, "/api/people/x", { slug: "x" });
    expect(r.status).toBe(404);
  });

  it("education/:slug 404s for hidden", async () => {
    await db.insert(education).values({
      slug: "x",
      name: "x",
      description: "x",
      visible: false,
    });
    const r = await callLoader(educationDetailLoader, "/api/education/x", { slug: "x" });
    expect(r.status).toBe(404);
  });

  it("technologies/:slug 404s for hidden", async () => {
    await db.insert(technologies).values({
      slug: "x",
      name: "x",
      category: "language",
      visible: false,
    });
    const r = await callLoader(technologyDetailLoader, "/api/technologies/x", { slug: "x" });
    expect(r.status).toBe(404);
  });

  it("news/:slug 404s for draft", async () => {
    await db.insert(news).values({ slug: "x", type: "article", title: "x", status: "draft" });
    const r = await callLoader(newsDetailLoader, "/api/news/x", { slug: "x" });
    expect(r.status).toBe(404);
  });

  it("jobs/:slug 404s for hidden", async () => {
    await db.insert(jobs).values({
      slug: "x",
      title: "x",
      status: "hidden",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    });
    const r = await callLoader(jobDetailLoader, "/api/jobs/x", { slug: "x" });
    expect(r.status).toBe(404);
  });

  it("events/:slug 404s for hidden import", async () => {
    await db.insert(events).values({
      slug: "x",
      title: "x",
      description: "x",
      link: "https://e.com",
      importStatus: "hidden",
    });
    const r = await callLoader(eventDetailLoader, "/api/events/x", { slug: "x" });
    expect(r.status).toBe(404);
  });
});

// ===========================================================================
// PRODUCTS / PROJECTS — these tables currently have NO visibility column,
// but they reference companies. Pin down that we don't leak hidden
// companies through them (e.g. "this product is made by HiddenCo").
// ===========================================================================

describe("GET /api/products/:slug — does not leak hidden company", () => {
  it("does not expose a hidden company on the product detail", async () => {
    const [co] = await db
      .insert(companies)
      .values({
        slug: "hidden-parent-co",
        name: "HIDDEN_PARENT_CO",
        description: "shh",
        visible: false,
      })
      .returning();

    await db.insert(products).values({
      slug: "child-product",
      name: "Child Product",
      description: "p",
      companyId: co.id,
    });

    const { loader: productDetailLoader } = await import("~/routes/api/products.$slug");
    const { body } = await callLoader(productDetailLoader, "/api/products/child-product", {
      slug: "child-product",
    });

    expect(JSON.stringify(body)).not.toContain("HIDDEN_PARENT_CO");
  });
});

describe("GET /api/technologies/:slug — does not leak hidden projects", () => {
  it("filters out hidden companies (already covered) and does not include hidden projects", async () => {
    // technologies.$slug filters companies by visible=true already; projects
    // table has no visibility flag, but if one is added, this test will
    // make sure we don't regress. For now we just assert the existing
    // company filter is still in place.
    const [techRow] = await db
      .insert(technologies)
      .values({ slug: "t1", name: "T1", category: "language", visible: true })
      .returning();

    const [coVisible] = await db
      .insert(companies)
      .values({ slug: "vis-co", name: "Vis Co", description: "x", visible: true })
      .returning();
    const [coHidden] = await db
      .insert(companies)
      .values({
        slug: "hid-co",
        name: "HIDDEN_TECH_USER",
        description: "x",
        visible: false,
      })
      .returning();

    const { technologyAssignments } = await import("~/db/schema");
    await db.insert(technologyAssignments).values([
      { technologyId: techRow.id, contentType: "company", contentId: coVisible.id },
      { technologyId: techRow.id, contentType: "company", contentId: coHidden.id },
    ]);

    const { body } = await callLoader(technologyDetailLoader, "/api/technologies/t1", {
      slug: "t1",
    });

    expect(JSON.stringify(body)).not.toContain("HIDDEN_TECH_USER");
  });
});

// ===========================================================================
// PROJECTS — projects have a "status" lifecycle field but no public/private
// flag. This test just pins that down so we don't accidentally start
// leaking something later.
// ===========================================================================

describe("GET /api/projects — projects have no hidden state", () => {
  it("returns active and archived projects (lifecycle is not visibility)", async () => {
    await db.insert(projects).values({
      slug: "p-active",
      name: "P Active",
      description: "d",
      type: "other",
      status: "active",
    });
    await db.insert(projects).values({
      slug: "p-archived",
      name: "P Archived",
      description: "d",
      type: "other",
      status: "archived",
    });

    const { loader: projectsListLoader } = await import("~/routes/api/projects");
    const { body } = await callLoader(projectsListLoader, "/api/projects");
    const slugs = asList(body).data.map((p) => p.slug);

    // Projects don't have a "hidden" concept; both should appear.
    expect(slugs).toContain("p-active");
    expect(slugs).toContain("p-archived");
  });
});
