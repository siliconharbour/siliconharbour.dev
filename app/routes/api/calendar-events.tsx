import type { Route } from "./+types/calendar-events";
import { getEventsForMonth } from "~/lib/events.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month"); // Expected: "YYYY-MM"

  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return Response.json(
      { error: "month parameter required in YYYY-MM format" },
      { status: 400 },
    );
  }

  const [yearStr, monthStr] = monthParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  if (month < 1 || month > 12) {
    return Response.json({ error: "Invalid month" }, { status: 400 });
  }

  const events = await getEventsForMonth(year, month);

  return Response.json(events, {
    headers: {
      "Cache-Control": "public, max-age=300",
    },
  });
}
