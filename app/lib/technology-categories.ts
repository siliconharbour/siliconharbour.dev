import type { TechnologyCategory } from "~/db/schema";

// Category labels for UI - shared between client and server
export const categoryLabels: Record<TechnologyCategory, string> = {
  language: "Languages",
  frontend: "Frontend",
  backend: "Backend",
  cloud: "Cloud",
  database: "Databases",
  devops: "DevOps",
  "game-engine": "Game Engines",
  mobile: "Mobile",
  "data-science": "Data Science",
  platform: "Platforms",
  specialized: "Specialized",
};
