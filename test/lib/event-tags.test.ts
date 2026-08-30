import { describe, expect, it } from "vitest";
import {
  createEventTag,
  deleteEventTag,
  getEventTagsWithUsage,
  setEventTags,
  updateEventTag,
} from "~/lib/event-tags.server";
import { createEvent, getEventById, updateEvent } from "~/lib/events.server";

const eventData = {
  title: "Tagged Event",
  description: "A tagged event for testing",
  link: "https://example.com/event",
  location: null,
  organizer: null,
  coverImage: null,
  iconImage: null,
  coverImageUrl: null,
};

describe("event tags", () => {
  it("creates, assigns, updates, and removes a reusable tag", async () => {
    const tag = await createEventTag("Game jam", "red");
    const event = await createEvent(
      eventData,
      [{ startDate: new Date("2026-09-12T14:30:00Z"), endDate: null, isAllDay: true }],
      [tag.id],
    );

    expect(event.tags).toMatchObject([{ name: "Game jam", slug: "game-jam", color: "red" }]);
    expect((await getEventTagsWithUsage())[0].eventCount).toBe(1);

    await updateEventTag(tag.id, "Hackathon", "purple");
    expect((await getEventById(event.id))?.tags).toMatchObject([
      { name: "Hackathon", slug: "hackathon", color: "purple" },
    ]);

    await deleteEventTag(tag.id);
    expect((await getEventById(event.id))?.tags).toEqual([]);
  });

  it("replaces event assignments when an event is saved", async () => {
    const first = await createEventTag("Game jam", "red");
    const second = await createEventTag("Community", "harbour");
    const event = await createEvent(
      eventData,
      [{ startDate: new Date("2026-09-12T14:30:00Z"), endDate: null, isAllDay: true }],
      [first.id],
    );

    await updateEvent(event.id, {}, undefined, [second.id]);
    expect((await getEventById(event.id))?.tags?.map((tag) => tag.slug)).toEqual(["community"]);

    await setEventTags(event.id, []);
    expect((await getEventById(event.id))?.tags).toEqual([]);
  });
});
