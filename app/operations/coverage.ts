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
