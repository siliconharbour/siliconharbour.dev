import type { Route } from "./+types/home";
import { Link, useLoaderData } from "react-router";
import { getEventsThisWeek, getUpcomingEvents } from "~/lib/events.server";
import { getAllCompanies } from "~/lib/companies.server";
import { getAllGroups } from "~/lib/groups.server";
import { getAllPeople } from "~/lib/people.server";
import { getAllLearning } from "~/lib/learning.server";
import { getPublishedNews } from "~/lib/news.server";
import { getActiveJobs } from "~/lib/jobs.server";
import { getAllProjects } from "~/lib/projects.server";
import { prepareRefsForClient } from "~/lib/references.server";
import { getSectionVisibility } from "~/lib/config.server";
import { Calendar } from "~/components/Calendar";
import { EventCard } from "~/components/EventCard";
import { format } from "date-fns";
import type { ResolvedRef } from "~/components/RichMarkdown";
import type { SectionKey } from "~/db/schema";
import { Footer } from "~/components/Footer";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "siliconharbour.dev" },
    { name: "description", content: "Discover St. John's tech, events, companies, people, and more." },
  ];
}

export async function loader({}: Route.LoaderArgs) {
  const [thisWeek, upcoming, companies, groups, people, learning, news, jobs, projects, visibility] = await Promise.all([
    getEventsThisWeek(),
    getUpcomingEvents(),
    getAllCompanies(),
    getAllGroups(),
    getAllPeople(),
    getAllLearning(),
    getPublishedNews(),
    getActiveJobs(),
    getAllProjects(),
    getSectionVisibility(),
  ]);
  
  const thisWeekIds = new Set(thisWeek.map(e => e.id));
  const futureEvents = upcoming.filter(e => !thisWeekIds.has(e.id));

  // Prepare refs for featured events (thisWeek events that show descriptions)
  const eventRefs: Record<number, Record<string, ResolvedRef>> = {};
  await Promise.all(
    thisWeek.map(async (event) => {
      eventRefs[event.id] = await prepareRefsForClient(event.description);
    })
  );

  return { 
    thisWeek, 
    futureEvents, 
    allEvents: upcoming,
    companies,
    groups,
    people,
    learning,
    news: news.slice(0, 3), // Latest 3 news articles
    jobs: jobs.slice(0, 4), // Latest 4 jobs
    projects: projects.slice(0, 4), // Latest 4 projects
    eventRefs,
    visibility,
    counts: {
      companies: companies.length,
      groups: groups.length,
      people: people.length,
      learning: learning.length,
      news: news.length,
      jobs: jobs.length,
      events: upcoming.length,
      projects: projects.length,
      products: 0, // Not shown in quick links yet
    }
  };
}

// Quick links config with section keys
const quickLinks: { to: string; label: string; key: SectionKey }[] = [
  { to: "/events", label: "Events", key: "events" },
  { to: "/companies", label: "Companies", key: "companies" },
  { to: "/projects", label: "Projects", key: "projects" },
  { to: "/jobs", label: "Jobs", key: "jobs" },
  { to: "/news", label: "News", key: "news" },
  { to: "/groups", label: "Groups", key: "groups" },
  { to: "/people", label: "People", key: "people" },
  { to: "/learning", label: "Learning", key: "learning" },
];

export default function Home() {
  const { 
    thisWeek, 
    futureEvents, 
    allEvents, 
    companies, 
    news, 
    jobs,
    projects,
    counts,
    eventRefs,
    visibility,
  } = useLoaderData<typeof loader>();

  const hasEvents = allEvents.length > 0;
  const featuredCompanies = companies.slice(0, 4);
  const featuredProjects = projects.slice(0, 4);
  
  // Filter quick links based on visibility
  const visibleQuickLinks = quickLinks.filter(link => visibility[link.key]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Header */}
      <header className="h-[40vh] min-h-[320px] flex flex-col items-center justify-center p-4">
        <img 
          src="/siliconharbour.svg" 
          alt="Silicon Harbour" 
          className="h-32 md:h-40 lg:h-48 w-auto"
        />
        <p className="text-2xl md:text-3xl lg:text-3xl font-bold text-harbour-600 tracking-wide pt-4">
          siliconharbour.dev
        </p>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto p-4 pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main content */}
            <div className="lg:col-span-2 flex flex-col gap-8">
              {/* This week */}
              {visibility.events && thisWeek.length > 0 && (
                <section className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold text-harbour-700">This Week</h2>
                  <div className="flex flex-col gap-4">
                    {thisWeek.map((event) => (
                      <EventCard 
                        key={event.id} 
                        event={event} 
                        variant="featured" 
                        resolvedRefs={eventRefs[event.id]}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Upcoming events */}
              {visibility.events && futureEvents.length > 0 && (
                <section className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-harbour-700">Upcoming Events</h2>
                    <Link to="/events" className="text-sm text-harbour-500 hover:text-harbour-700">
                      View all
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {futureEvents.slice(0, 4).map((event) => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </div>
                </section>
              )}

              {/* No events state */}
              {visibility.events && !hasEvents && (
                <div className="text-center p-12 ring-1 ring-harbour-200/50">
                  <h2 className="text-xl font-semibold text-harbour-700">No upcoming events</h2>
                  <p className="text-harbour-400 pt-2">
                    Check back soon for new events!
                  </p>
                </div>
              )}

              {/* Latest News */}
              {visibility.news && news.length > 0 && (
                <section className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-harbour-700">Latest News</h2>
                    <Link to="/news" className="text-sm text-harbour-500 hover:text-harbour-700">
                      View all
                    </Link>
                  </div>
                  <div className="flex flex-col gap-4">
                    {news.map((article) => (
                      <Link
                        key={article.id}
                        to={`/news/${article.slug}`}
                        className="group flex flex-col sm:flex-row gap-4 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
                      >
                        {article.coverImage && (
                          <div className="img-tint w-full sm:w-32 h-24 relative overflow-hidden bg-harbour-100 flex-shrink-0">
                            <img
                              src={`/images/${article.coverImage}`}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <h3 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
                            {article.title}
                          </h3>
                          {article.publishedAt && (
                            <p className="text-xs text-harbour-400">
                              {format(article.publishedAt, "MMMM d, yyyy")}
                            </p>
                          )}
                          {article.excerpt && (
                            <p className="text-sm text-harbour-500 line-clamp-2">{article.excerpt}</p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Featured Companies */}
              {visibility.companies && featuredCompanies.length > 0 && (
                <section className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-harbour-700">Companies</h2>
                    <Link to="/directory/companies" className="text-sm text-harbour-500 hover:text-harbour-700">
                      View all
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {featuredCompanies.map((company) => (
                      <Link
                        key={company.id}
                        to={`/directory/companies/${company.slug}`}
                        className="group flex flex-col items-center gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
                      >
                        {company.logo ? (
                          <div className="w-12 h-12 relative overflow-hidden bg-harbour-100">
                            <img
                              src={`/images/${company.logo}`}
                              alt=""
                              className="absolute inset-0 w-full h-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-harbour-100 flex items-center justify-center">
                            <span className="text-lg text-harbour-400">{company.name.charAt(0)}</span>
                          </div>
                        )}
                        <span className="link-title text-sm font-medium text-harbour-700 group-hover:text-harbour-600 text-center line-clamp-2">
                          {company.name}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Featured Projects */}
              {visibility.projects && featuredProjects.length > 0 && (
                <section className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-harbour-700">Projects</h2>
                    <Link to="/directory/projects" className="text-sm text-harbour-500 hover:text-harbour-700">
                      View all
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {featuredProjects.map((project) => (
                      <Link
                        key={project.id}
                        to={`/directory/projects/${project.slug}`}
                        className="group flex flex-col items-center gap-3 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
                      >
                        {project.logo ? (
                          <div className="img-tint w-12 h-12 relative overflow-hidden bg-harbour-100">
                            <img
                              src={`/images/${project.logo}`}
                              alt=""
                              className="absolute inset-0 w-full h-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-harbour-100 flex items-center justify-center">
                            <span className="text-lg text-harbour-400">{project.name.charAt(0)}</span>
                          </div>
                        )}
                        <span className="link-title text-sm font-medium text-harbour-700 group-hover:text-harbour-600 text-center line-clamp-2">
                          {project.name}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Active Jobs */}
              {visibility.jobs && jobs.length > 0 && (
                <section className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-harbour-700">Jobs</h2>
                    <Link to="/jobs" className="text-sm text-harbour-500 hover:text-harbour-700">
                      View all
                    </Link>
                  </div>
                  <div className="flex flex-col gap-3">
                    {jobs.map((job) => (
                      <Link
                        key={job.id}
                        to={`/jobs/${job.slug}`}
                        className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 ring-1 ring-harbour-200/50 hover:ring-harbour-300 transition-all"
                      >
                        <div className="flex flex-col gap-1">
                          <h3 className="link-title font-semibold text-harbour-700 group-hover:text-harbour-600">
                            {job.title}
                          </h3>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-harbour-500">
                            {job.companyName && <span>{job.companyName}</span>}
                            {job.location && <span>{job.location}</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {job.remote && (
                            <span className="text-xs px-2 py-1 bg-harbour-100 text-harbour-600">
                              Remote
                            </span>
                          )}
                          {job.salaryRange && (
                            <span className="text-xs px-2 py-1 bg-harbour-100 text-harbour-600">
                              {job.salaryRange}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <div className="sticky top-8 flex flex-col gap-6">
                {/* Calendar */}
                {visibility.events && <Calendar events={allEvents} />}

                {/* Quick Links */}
                <div className="flex flex-col gap-3 p-4 ring-1 ring-harbour-200/50">
                  <h3 className="text-sm font-semibold text-harbour-700">Explore</h3>
                  <nav className="flex flex-col gap-2">
                    {visibleQuickLinks.map((link) => (
                      <QuickLink 
                        key={link.to}
                        to={link.to} 
                        label={link.label} 
                        count={counts[link.key]} 
                      />
                    ))}
                  </nav>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function QuickLink({ to, label, count }: { to: string; label: string; count: number }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between py-1 text-sm text-harbour-600 hover:text-harbour-700"
    >
      <span>{label}</span>
      <span className="text-harbour-400">{count}</span>
    </Link>
  );
}
