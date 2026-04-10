import { describe, it, expect } from "vitest";
import { getContentUrl } from "~/lib/references/url";
import type { ContentType } from "~/db/schema";

describe("getContentUrl", () => {
  it("maps event to /events/{slug}", () => {
    expect(getContentUrl("event", "tech-meetup")).toBe(
      "/events/tech-meetup",
    );
  });

  it("maps company to /directory/companies/{slug}", () => {
    expect(getContentUrl("company", "verafin")).toBe(
      "/directory/companies/verafin",
    );
  });

  it("maps group to /directory/groups/{slug}", () => {
    expect(getContentUrl("group", "devnl")).toBe("/directory/groups/devnl");
  });

  it("maps person to /directory/people/{slug}", () => {
    expect(getContentUrl("person", "john-doe")).toBe(
      "/directory/people/john-doe",
    );
  });

  it("maps education to /directory/education/{slug}", () => {
    expect(getContentUrl("education", "mun")).toBe(
      "/directory/education/mun",
    );
  });

  it("maps news to /news/{slug}", () => {
    expect(getContentUrl("news", "big-announcement")).toBe(
      "/news/big-announcement",
    );
  });

  it("maps job to /jobs/{slug}", () => {
    expect(getContentUrl("job", "senior-dev")).toBe("/jobs/senior-dev");
  });

  it("maps project to /directory/projects/{slug}", () => {
    expect(getContentUrl("project", "cool-app")).toBe(
      "/directory/projects/cool-app",
    );
  });

  it("maps product to /directory/products/{slug}", () => {
    expect(getContentUrl("product", "saas-tool")).toBe(
      "/directory/products/saas-tool",
    );
  });
});
