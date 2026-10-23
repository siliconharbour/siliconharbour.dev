import { jobTechnologyOperations } from "./ops/job-technology.server";
import { jobSearchOperations } from "./ops/job-search.server";
import { jobSourceOperations } from "./ops/job-sources.server";
import { newsSourceOperations } from "./ops/news-sources.server";
import { jobStatusOperations } from "./ops/job-status.server";
import { newsStatusOperations } from "./ops/news-status.server";
import { jobOperations } from "./ops/jobs.server";
import { newsOperations } from "./ops/news.server";
import { eventSourceOperations } from "./ops/event-sources.server";
import { eventTagOperations } from "./ops/event-tags.server";
import { eventOccurrenceOperations } from "./ops/event-occurrences.server";
import { eventOperations } from "./ops/events.server";
import { directoryReviewOperations } from "./ops/directory-review.server";
import { directoryTechnologyOperations } from "./ops/directory-technologies.server";
import { projectGalleryOperations } from "./ops/project-gallery.server";
import { technologyOperations } from "./ops/technologies.server";
import { projectOperations } from "./ops/projects.server";
import { productOperations } from "./ops/products.server";
import { groupOperations } from "./ops/groups.server";
import { educationOperations } from "./ops/education.server";
import { companyOperations } from "./ops/companies.server";
import { personOperations } from "./ops/people.server";
import { themeShareOperations } from "./ops/theme-shares.server";

export const operationCatalog = {
  ...jobTechnologyOperations,
  ...jobSearchOperations,
  ...jobSourceOperations,
  ...newsSourceOperations,
  ...jobStatusOperations,
  ...newsStatusOperations,
  ...jobOperations,
  ...newsOperations,
  ...eventOperations,
  ...eventOccurrenceOperations,
  ...eventTagOperations,
  ...eventSourceOperations,

  ...themeShareOperations,
  ...personOperations,
  ...companyOperations,
  ...educationOperations,
  ...groupOperations,
  ...productOperations,
  ...projectOperations,
  ...technologyOperations,
  ...directoryReviewOperations,
  ...directoryTechnologyOperations,
  ...projectGalleryOperations,
};
