import { operationDescribe } from "./ops/operation-describe.server";
import { publicReadOperations } from "./ops/public-reads.server";
import { importerStatusOperations } from "./ops/importer-status.server";
import { githubImporterOperations } from "./ops/github-importers.server";
import { directoryImporterOperations } from "./ops/directory-importers.server";
import { discordOperations } from "./ops/discord.server";
import { exportOperations } from "./ops/export.server";
import { dashboardOperations } from "./ops/dashboard.server";
import { imageOperations } from "./ops/images.server";
import { newsletterOperations } from "./ops/newsletter.server";
import { blocklistOperations } from "./ops/blocklist.server";
import { commentOperations } from "./ops/comments.server";
import { configOperations } from "./ops/config.server";
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
  operationDescribe,
  ...publicReadOperations,
  ...importerStatusOperations,
  ...githubImporterOperations,
  ...directoryImporterOperations,
  ...discordOperations,
  ...exportOperations,
  ...dashboardOperations,
  ...imageOperations,
  ...newsletterOperations,
  ...blocklistOperations,
  ...commentOperations,
  ...configOperations,
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
