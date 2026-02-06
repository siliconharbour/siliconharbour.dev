// Technology categories - shared between client and server
export const technologyCategories = [
  "language",
  "frontend",
  "backend",
  "cloud",
  "database",
  "devops",
  "games-and-graphics",
  "mobile",
  "data-science",
  "platform",
  "specialized",
] as const;

export type TechnologyCategory = (typeof technologyCategories)[number];

// Category labels for UI
export const categoryLabels: Record<TechnologyCategory, string> = {
  language: "Languages",
  frontend: "Frontend",
  backend: "Backend",
  cloud: "Cloud",
  database: "Databases",
  devops: "DevOps",
  "games-and-graphics": "Games & Graphics",
  mobile: "Mobile",
  "data-science": "Data Science",
  platform: "Platforms",
  specialized: "Specialized",
};
