import type { EventTagColor } from "~/db/schema";

export const eventTagColorStyles: Record<EventTagColor, string> = {
  harbour: "bg-harbour-100 text-harbour-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
};

export const eventTagColorLabels: Record<EventTagColor, string> = {
  harbour: "Harbour",
  green: "Green",
  amber: "Amber",
  red: "Red",
  purple: "Purple",
};
