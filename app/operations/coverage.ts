import { jobsNewsCoverage } from "./coverage/jobs-news";
import { directoryCoverage } from "./coverage/directory";
import { eventsCoverage } from "./coverage/events";
import { pendingCoverage } from "./coverage/pending";
export type ColumnCoverage =
  | { mapped: Record<string, string> }
  | { excluded: string }
  | { gap: string };
export const columnCoverage = {
  ...directoryCoverage,
  ...eventsCoverage,
  ...jobsNewsCoverage,
  ...pendingCoverage,
};
