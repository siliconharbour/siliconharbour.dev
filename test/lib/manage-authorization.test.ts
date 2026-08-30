import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "~/db";
import { users } from "~/db/schema";
import { createSession, hashPassword } from "~/lib/auth.server";
import { sessionStorage } from "~/lib/session.server";
import { action as createEventAction } from "~/routes/manage/events/new";

async function requestForRole(role: "regular" | "admin") {
  const [user] = await db
    .insert(users)
    .values({
      email: `${role}@example.com`,
      passwordHash: await hashPassword("password123"),
      role,
    })
    .returning();
  const sessionId = await createSession(user.id);
  const session = await sessionStorage.getSession();
  session.set("sessionId", sessionId);
  const cookie = await sessionStorage.commitSession(session);
  return new Request("http://localhost/manage/events/new", {
    method: "POST",
    headers: { Cookie: cookie },
    body: new URLSearchParams(),
  });
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("management authorization boundary", () => {
  it("blocks a regular user's direct mutation request before parsing form data", async () => {
    await expect(
      createEventAction({ request: await requestForRole("regular") } as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("requires the admin guard in every management data route", () => {
    const manageRoutes = join(process.cwd(), "app/routes/manage");
    const exemptions = new Set([join(manageRoutes, "login.tsx"), join(manageRoutes, "logout.tsx")]);

    for (const file of routeFiles(manageRoutes)) {
      if (exemptions.has(file)) continue;
      const source = readFileSync(file, "utf8");
      if (!/export (?:async function|const) (?:loader|action)/.test(source)) continue;
      expect(source, `${file} must enforce administrator access`).toContain("requireAdmin(request)");
    }
  });
});
