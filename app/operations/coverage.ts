import { jobsNewsCoverage } from "./coverage/jobs-news";
import { directoryCoverage } from "./coverage/directory";
import { eventsCoverage } from "./coverage/events";
import { administrationCoverage } from "./coverage/administration";
export type ColumnCoverage =
  | { mapped: Record<string, string> }
  | { excluded: string }
  | { gap: string };
export const columnCoverage = {
  ...directoryCoverage,
  ...eventsCoverage,
  ...jobsNewsCoverage,
  ...administrationCoverage,
};

export const operationControlFields = {
  id: "Selects an existing record; generated on create",
  ifNotExists: "Controls conditional creation without persisting a column",
};

export const excludedTables: Record<string, string> = {
  users: "User administration is script-only; authentication services own credentials.",
  sessions: "Created and invalidated by login/logout and session expiry.",
  oauth_clients: "OAuth client registration and administration are separate auth flows.",
  oauth_authorization_codes: "Short-lived credentials managed by OAuth consent and token exchange.",
  oauth_consent_requests: "Short-lived state managed by OAuth authorization.",
  oauth_tokens: "Issued, refreshed and revoked by OAuth services.",
  references: "Derived from entity markdown and synchronized by content services.",
  job_technology_mentions:
    "Extracted from imported job descriptions by technology preview operations.",
  discord_post_items:
    "Tracks the content included in each Discord post; written by posting services.",
  rate_limits: "Anti-abuse counters managed by request rate limiting.",
};
