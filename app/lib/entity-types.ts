export const contentTypes = [
  "event",
  "company",
  "group",
  "education",
  "person",
  "news",
  "job",
  "project",
  "product",
] as const;

export const eventTimeModes = ["scheduled", "period"] as const;

export const eventTagColors = ["harbour", "green", "amber", "red", "purple"] as const;

export const fetchStatuses = ["pending", "success", "error", "rate_limited"] as const;

export const eventSourceTypes = [
  "luma-user",
  "luma-calendar",
  "technl",
  "netbenefit",
  "eventbrite",
  "bevy",
  "meetup",
] as const;

export const newsTypes = ["link", "article"] as const;

export const newsStatuses = ["draft", "pending_review", "published", "hidden"] as const;

export const newsSourceTypes = ["rss", "custom"] as const;

export const excerptModes = ["description", "content", "none"] as const;

export const jobSourceTypes = ["manual", "imported"] as const;

export const jobStatuses = [
  "active",
  "pending_review",
  "removed",
  "filled",
  "expired",
  "hidden",
] as const;

export const workplaceTypes = ["remote", "onsite", "hybrid"] as const;

export const projectTypes = ["game", "webapp", "library", "tool", "hardware", "other"] as const;

export const projectStatuses = ["active", "completed", "archived", "on-hold"] as const;

export const productTypes = ["saas", "mobile", "physical", "service", "other"] as const;

export const sectionKeys = [
  "events",
  "companies",
  "groups",
  "projects",
  "products",
  "education",
  "people",
  "news",
  "jobs",
] as const;

export const commentableKeys = [
  "companies",
  "groups",
  "education",
  "projects",
  "products",
  "news",
] as const;

export const technologyCategories = [
  "language",
  "frontend",
  "backend",
  "cloud",
  "database",
  "games-and-graphics",
  "mobile",
  "data-science",
  "llm",
  "platform",
  "specialized",
] as const;

export const technologizedTypes = ["company", "project"] as const;

export const technologyEvidenceSourceTypes = ["job_posting", "survey", "manual"] as const;

export const atsSourceTypes = [
  "greenhouse",
  "ashby",
  "workday",
  "bamboohr",
  "lever",
  "collage",
  "rippling",
  "adp",
  "careerbeacon",
  "workable",
  "icims",
  "jibe",
  "oracle-hcm",
  "successfactors",
  "dayforce",
  "jazzhr",
  "custom",
  "kyrix",
] as const;

export const discordChannelTypes = ["events", "jobs"] as const;

export const discordPostItemTypes = ["event", "job"] as const;

export const educationTypes = ["university", "college", "bootcamp", "online", "other"] as const;

export const importJobStatuses = ["idle", "running", "paused", "completed", "error"] as const;
export const githubFollowingModes = ["following", "followers", "both"] as const;
