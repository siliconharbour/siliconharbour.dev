import { useState } from "react";
import type { News } from "~/db/schema";
import type { CompanyWithJobs } from "~/lib/jobs.server";
import { EventCard, type EventCardProps } from "~/components/EventCard";
import { CompanyCard } from "~/components/directory/CompanyCard";
import { CompanyJobCard, JobRow } from "~/components/JobCards";
import { BaseMultiSelect } from "~/components/BaseMultiSelect";
import { Calendar } from "~/components/Calendar";
import { NewsListing } from "~/components/news/NewsListing";

const sampleEvent: EventCardProps["event"] = {
  id: -1,
  slug: "design-preview",
  title: "Community workshop",
  description: "Meet local builders and share what you are working on.",
  location: "St. John's, NL",
  organizer: "Harbour community",
  coverImage: "design-cover.svg",
  iconImage: null,
  recurrenceRule: null,
  timeMode: "scheduled",
  dates: [
    {
      id: -1,
      eventId: -1,
      startDate: new Date("2030-10-14T17:00:00Z"),
      endDate: null,
      isAllDay: false,
    },
  ],
};

export function ComponentShowcase({
  companies,
  news,
}: {
  companies: CompanyWithJobs[];
  news: News[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const options = companies.map(({ company }) => ({
    value: String(company.id),
    label: company.name,
    imageSrc: company.logo ? `/images/${company.logo}` : undefined,
  }));
  const recurring = {
    ...sampleEvent,
    title: "Recurring meetup",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
  };

  return (
    <section className="flex flex-col gap-gap-6" aria-labelledby="production-components">
      <div>
        <h2 id="production-components" className="text-lg font-semibold text-heading">
          Live site components
        </h2>
        <p className="text-sm text-muted">
          These are the components used on the site. Events are examples; companies, jobs and news
          use published content.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-gap-4">
        <div className="flex flex-col gap-gap-3">
          <h3 className="font-semibold text-heading">Event cards</h3>
          <EventCard event={sampleEvent} />
          <EventCard event={recurring} variant="compact" />
          <EventCard
            event={{ ...recurring, title: "A second recurring meetup", coverImage: null }}
            variant="compact"
          />
        </div>
        <div className="flex flex-col gap-gap-3">
          <h3 className="font-semibold text-heading">Featured and linked events</h3>
          <EventCard
            event={recurring}
            variant="featured"
            linkedEvents={[
              {
                id: -2,
                slug: "design-preview-session",
                title: "Follow-up session",
                dates: sampleEvent.dates,
              },
            ]}
          />
        </div>
      </div>
      {companies.length > 0 && (
        <>
          <h3 className="font-semibold text-heading">Directory and job cards</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gap-4">
            <CompanyCard company={companies[0].company} />
            <label className="flex flex-col gap-gap-2 text-sm text-heading">
              Company multi-select
              <BaseMultiSelect
                name="preview-companies"
                options={options}
                selectedValues={selected}
                onChange={setSelected}
                showSelectedChipsInTrigger
                showSelectedChipsBelow={false}
              />
            </label>
          </div>
          <CompanyJobCard
            data={{ ...companies[0], jobs: companies[0].jobs.slice(0, 2) }}
            isAdmin={false}
          />
          <div className="card-surface overflow-hidden">
            <JobRow company={companies[0].company} job={companies[0].jobs[0]} />
          </div>
        </>
      )}
      <div className="max-w-sm">
        <h3 className="font-semibold text-heading mb-3">Event calendar</h3>
        <Calendar navigateOnClick={false} />
      </div>
      {news.length > 0 && (
        <div>
          <h3 className="font-semibold text-heading mb-3">News listing</h3>
          <NewsListing
            data={{
              articles: news,
              total: news.length,
              limit: news.length,
              offset: 0,
              searchQuery: "",
              hasRecentHeadline: true,
            }}
            searchPlaceholder="Search news..."
            emptyNoSearch="No published news."
            emptyWithSearch="No matching news."
            headlineMode
            showTypeBadge
          />
        </div>
      )}
    </section>
  );
}
