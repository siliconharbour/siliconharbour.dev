import { checkbox, imageFromForm } from "./form-adapters";
export function eventFormInput(form: FormData, editing: boolean) {
  const recurring = form.get("eventType") === "recurring";
  const input: Record<string, unknown> = {
    title: form.get("title"),
    description: form.get("description"),
    link: form.get("link"),
    location: form.get("location") ?? null,
    organizer: form.get("organizer") ?? null,
    requiresSignup: checkbox(form, "requiresSignup"),
    timeMode: form.get("eventType") === "period" ? "period" : "scheduled",
    parentEventId: form.get("parentEventId") ? Number(form.get("parentEventId")) : null,
    tagIds: form.getAll("tagIds").map(Number),
    coverImage: imageFromForm(form, "coverImage", editing),
  };
  const icon = form.get("iconImageData");
  if (icon) input.iconImage = { kind: "dataUrl", dataUrl: icon };
  else if (editing && form.has("existingIconImage"))
    input.iconImage = { kind: form.get("existingIconImage") ? "keep" : "clear" };
  if (recurring) {
    for (const field of [
      "recurrenceRule",
      "recurrenceStart",
      "recurrenceEnd",
      "defaultStartTime",
      "defaultEndTime",
    ])
      input[field] = form.get(field) || null;
  } else {
    const dates = [];
    for (let index = 0; form.has(`dates[${index}][startDate]`); index++) {
      const key = (name: string) => form.get(`dates[${index}][${name}]`);
      const allDay = key("isAllDay") === "1";
      dates.push({
        startDate: key("startDate"),
        ...(key("hasEnd") === "1" && {
          endDate: key("endDate"),
          ...(!allDay && { endTime: key("endTime") }),
        }),
        isAllDay: allDay,
        ...(!allDay && { startTime: key("startTime") }),
      });
    }
    input.dates = dates;
  }
  if (!editing) input.importStatus = null;
  if (form.get("intent") === "save-and-publish") input.importStatus = "published";
  if (form.get("intent") === "save-and-unpublish") input.importStatus = "hidden";
  return input;
}
