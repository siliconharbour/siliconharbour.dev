import { createJob } from "~/lib/jobs.server";
import { expect, it } from "vitest";
import { Effect } from "effect";
import { db } from "~/db";
import { people, jobs, companies } from "~/db/schema";
import { eq } from "drizzle-orm";
import { buildExecuteFunctions } from "~/mcp/bridge";
import { createCodeMode } from "~/mcp/code-mode";
import { adminContext } from "~/operations/context";

it("rejects unknown and empty patches without changing the row", async () => {
  const [person] = await db
    .insert(people)
    .values({ slug: "test", name: "Test", bio: "Bio" })
    .returning();
  const functions = buildExecuteFunctions(adminContext(1));
  await expect(functions.updateEntity({ type: "person", id: person.id })).rejects.toThrow(
    "No fields to update",
  );
  await expect(
    functions.updateEntity({ type: "person", id: person.id, name: "  " }),
  ).rejects.toThrow("name is required");
  expect(await db.select().from(people).where(eq(people.id, person.id))).toEqual([person]);
  const runtime = createCodeMode(functions);
  const result = await Effect.runPromise(
    runtime.execute(
      `return await tools.siliconharbour.updateEntity({type:"person",id:${person.id},bogus:1});`,
    ),
  );
  expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining("bogus") } });
});

it("saves job companyId and isTechnical instead of silently dropping them", async () => {
  const [company] = await db
    .insert(companies)
    .values({ slug: "company", name: "Company", description: "Description" })
    .returning();
  const job = await createJob({
    title: "Developer",
    description: "Build things",
    url: "https://example.com",
  });
  await buildExecuteFunctions(adminContext(1)).updateEntity({
    type: "job",
    id: job.id,
    companyId: company.id,
    isTechnical: false,
  });
  expect(await db.select().from(jobs).where(eq(jobs.id, job.id))).toMatchObject([
    { companyId: company.id, isTechnical: false },
  ]);
});
