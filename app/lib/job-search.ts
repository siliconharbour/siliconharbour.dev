/**
 * Job search constants — client-safe (no server imports).
 */

/**
 * Curated search terms for tech job discovery in NL.
 * Used by both the UI select field and the MCP tool.
 */
export const JOB_SEARCH_TERMS = [
  "Software Developer",
  "Full Stack Developer",
  "Data Scientist",
  "AI Engineer",
  "Machine Learning",
  "DevOps",
  "Cloud Engineer",
  "IT Support",
  "Systems Administrator",
  "Cybersecurity",
  "UX Designer",
  "Product Manager",
  "QA Tester",
  "Technical Writer",
  "Engineering Manager",
] as const;

export type JobSearchTerm = (typeof JOB_SEARCH_TERMS)[number];
