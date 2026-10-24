import { expect, it, vi } from "vitest";
import { Effect } from "effect";
import { operationCatalog as operations } from "~/operations/catalog";
import { adminContext } from "~/operations/context";
import { createCodeMode } from "~/mcp/code-mode";
import { buildExecuteFunctions } from "~/mcp/bridge";
import { action as editPerson } from "~/routes/manage/people/edit";
import { action as editEvent } from "~/routes/manage/events/edit";
import { getOutgoingReferences } from "~/lib/references.server";
import { personToMarkdown, eventToMarkdown } from "~/lib/markdown.server";
import { getPersonById } from "~/lib/people.server";
import { getEventById } from "~/lib/events.server";
vi.mock("~/lib/session.server", () => ({
  requireAdmin: async () => ({ user: { id: 1, role: "admin" } }),
}));
const context = adminContext(1);
function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("https://example.com/manage", { method: "POST", body: form });
}
it("clears bios and event links through MCP and admin actions, including references and public outputs", async () => {
  const company = await operations.companyCreate.execute(context, {
    name: "Referenced Company",
    description: "Description",
  });
  const person = await operations.personCreate.execute(context, {
    name: "Person",
    bio: `Works with [[${company.name}]]`,
    visible: true,
  });
  const event = await operations.eventCreate.execute(context, {
    title: "Event",
    description: "Description",
    link: "https://example.com",
    importStatus: null,
    dates: [{ startDate: "2026-11-01", isAllDay: true }],
  });
  expect(await getOutgoingReferences("person", person.id)).toHaveLength(1);
  const runtime = createCodeMode(buildExecuteFunctions(context));
  const result = await Effect.runPromise(
    runtime.execute(
      `await tools.siliconharbour.personUpdate({id:${person.id},bio:null}); await tools.siliconharbour.eventUpdate({id:${event.id},link:null}); return true;`,
    ),
  );
  expect(result).toMatchObject({ ok: true, value: true });
  expect(await getOutgoingReferences("person", person.id)).toEqual([]);
  expect(await operations.personPublicGet.execute(context, { slug: person.slug })).toMatchObject({
    bio: null,
  });
  expect(await operations.eventPublicGet.execute(context, { slug: event.slug })).toMatchObject({
    link: null,
  });
  await operations.personUpdate.execute(context, { id: person.id, bio: "Restored" });
  await operations.eventUpdate.execute(context, { id: event.id, link: "https://example.com" });
  await editPerson({
    request: formRequest({ name: person.name, bio: " \t\n ", visible: "on" }),
    params: { id: String(person.id) },
  } as Parameters<typeof editPerson>[0]);
  await editEvent({
    request: formRequest({
      title: event.title,
      description: event.description,
      link: "  ",
      eventType: "one-time",
      "dates[0][startDate]": "2026-11-01",
      "dates[0][isAllDay]": "1",
      "dates[0][hasEnd]": "0",
    }),
    params: { id: String(event.id) },
  } as Parameters<typeof editEvent>[0]);
  expect(await getPersonById(person.id)).toMatchObject({ bio: null });
  expect(await getEventById(event.id)).toMatchObject({ link: null });
  expect(personToMarkdown((await getPersonById(person.id))!)).not.toContain("\nnull");
  expect(eventToMarkdown((await getEventById(event.id))!)).not.toContain("Event Link:");
});
it("defaults omitted values to null on create but never treats a missing link as an event identity", async () => {
  const person = await operations.personCreate.execute(context, { name: "No bio" });
  expect(person.bio).toBeNull();
  const input = {
    title: "Unlinked",
    description: "Description",
    dates: [{ startDate: "2026-11-01", isAllDay: true }],
  };
  const first = await operations.eventCreate.execute(context, input);
  const second = await operations.eventCreate.execute(context, input);
  expect(first.link).toBeNull();
  expect(first.id).not.toBe(second.id);
  await expect(
    operations.eventCreate.execute(context, { ...input, ifNotExists: true }),
  ).rejects.toThrow("stable identity");
  await expect(operations.personUpdate.execute(context, { id: person.id })).rejects.toThrow(
    "No fields to update",
  );
  await expect(operations.eventUpdate.execute(context, { id: first.id })).rejects.toThrow(
    "No fields to update",
  );
});
