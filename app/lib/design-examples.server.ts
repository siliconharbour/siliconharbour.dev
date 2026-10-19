import { getUpcomingEvents } from "./events.server";
import { getPublishedNews } from "./news.server";
import { getJobsGroupedByCompany } from "./jobs.server";

export async function loadDesignExamples() {
  const [events, news, companies] = await Promise.all([
    getUpcomingEvents(),
    getPublishedNews(),
    getJobsGroupedByCompany(),
  ]);
  return {
    eventPreviews: events.map(({ slug, title }) => ({ slug, title })),
    newsPreviews: news.map(({ slug, title }) => ({ slug, title })),
    previewToken: Date.now(),
    componentCompanies: companies
      .slice(0, 8)
      .map((data) => ({ ...data, jobs: data.jobs.slice(0, 2) })),
    componentNews: news.slice(0, 3),
  };
}
