import { hostSignature } from "~/mcp/host-function";
import { expect, it } from "vitest";
import { canonicalUrl, email, githubProfile } from "~/operations/fields";
import { externalLinksPatch } from "~/lib/links";
import { operationCatalog } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { getPersonByGitHub } from "~/lib/people.server";

it("accepts profile identifiers and rejects other hosts, repositories and invalid logins", () => {
  for (const value of ["Foo", "@Foo", "github.com/Foo", "https://www.GitHub.com/Foo/"])
    expect(githubProfile().parse(value)).toBe("https://github.com/foo");
  for (const value of [
    "https://example.com/foo",
    "github.com/foo/repo",
    "-foo",
    "foo-",
    "foo--bar",
    "foo_bar",
    "x".repeat(40),
    "https://user:pass@github.com/foo",
  ])
    expect(githubProfile().safeParse(value).success, value).toBe(false);
});
it("canonicalizes links without discarding website path case or www, and normalizes email", () => {
  expect(canonicalUrl().parse("  WWW.Example.COM/Path/  ")).toBe("https://www.example.com/Path/");
  expect(canonicalUrl().parse("https://EXAMPLE.com/")).toBe("https://example.com");
  expect(canonicalUrl().safeParse("https://user:pass@example.com").success).toBe(false);
  expect(canonicalUrl().safeParse("javascript:alert(1)").success).toBe(false);
  expect(
    externalLinksPatch.parse({
      twitter: "https://www.twitter.com/Foo/",
      linkedin: "https://www.linkedin.com/in/Profile",
    }),
  ).toEqual({ twitter: "https://x.com/foo", linkedin: "https://linkedin.com/in/Profile" });
  expect(
    externalLinksPatch.parse({ bluesky: "https://www.bsky.app/profile/Foo.BSKY.social/" }),
  ).toEqual({
    bluesky: "https://bsky.app/profile/foo.bsky.social",
  });
  expect(externalLinksPatch.parse({ bluesky: "http://example.com/@Me" })).toEqual({
    bluesky: "http://example.com/@Me",
  });
  expect(
    externalLinksPatch.parse({ bluesky: "https://bsky.app/profile/Foo.bsky.social/post/AbC" }),
  ).toEqual({
    bluesky: "https://bsky.app/profile/Foo.bsky.social/post/AbC",
  });
  expect(
    externalLinksPatch.safeParse({ bsky: "https://bsky.app/profile/foo.bsky.social" }).success,
  ).toBe(false);
  expect(hostSignature("personUpdate", operationCatalog.personUpdate.input)).toContain("bluesky");
  expect(email().parse("  Person@Example.COM ")).toBe("person@example.com");
});
it("finds and blocks a profile created from a bare login through the canonical operations", async () => {
  const context = adminContext(1);
  const person = await operationCatalog.personCreate.execute(context, {
    name: "Foo",
    bio: "Bio",
    externalLinks: { github: "@Foo" },
  });
  expect(person.externalLinks?.github).toBe("https://github.com/foo");
  expect((await getPersonByGitHub("https://github.com/FOO"))?.id).toBe(person.id);
  const result = await operationCatalog.blocklistAdd.execute(context, {
    source: "github",
    externalId: "foo",
    name: "Foo",
    deleteExisting: true,
    confirm: true,
  });
  expect(result.deletedIds).toEqual([person.id]);
  await expect(operationCatalog.personGet.execute(context, { id: person.id })).rejects.toThrow(
    "not found",
  );
});
