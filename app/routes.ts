import { type RouteConfig, index, route, prefix } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("conduct", "routes/conduct.tsx"),
  route("images/:filename", "routes/images.tsx"),
  route("calendar.ics", "routes/calendar-ics.tsx"),
  
  // Public content routes
  ...prefix("events", [
    index("routes/events/index.tsx"),
    route(":slug", "routes/events/detail.tsx"),
  ]),
  ...prefix("companies", [
    index("routes/companies/index.tsx"),
    route(":slug", "routes/companies/detail.tsx"),
  ]),
  ...prefix("groups", [
    index("routes/groups/index.tsx"),
    route(":slug", "routes/groups/detail.tsx"),
  ]),
  ...prefix("learning", [
    index("routes/learning/index.tsx"),
    route(":slug", "routes/learning/detail.tsx"),
  ]),
  ...prefix("people", [
    index("routes/people/index.tsx"),
    route(":slug", "routes/people/detail.tsx"),
  ]),
  ...prefix("news", [
    index("routes/news/index.tsx"),
    route(":slug", "routes/news/detail.tsx"),
  ]),
  ...prefix("jobs", [
    index("routes/jobs/index.tsx"),
    route(":slug", "routes/jobs/detail.tsx"),
  ]),
  ...prefix("projects", [
    index("routes/projects/index.tsx"),
    route(":slug", "routes/projects/detail.tsx"),
  ]),
  
  // RSS feeds
  route("feed.rss", "routes/feed-rss.tsx"),
  route("events.rss", "routes/events-rss.tsx"),
  route("news.rss", "routes/news-rss.tsx"),
  route("jobs.rss", "routes/jobs-rss.tsx"),
  
  // API routes
  route("api/comments", "routes/api.comments.tsx"),
  route("api/comments/delete", "routes/api.comments.delete.tsx"),
  
  // Admin routes
  ...prefix("manage", [
    route("login", "routes/manage/login.tsx"),
    route("logout", "routes/manage/logout.tsx"),
    index("routes/manage/index.tsx"),
    route("comments", "routes/manage/comments.tsx"),
    ...prefix("events", [
      index("routes/manage/events/index.tsx"),
      route("new", "routes/manage/events/new.tsx"),
      route(":id", "routes/manage/events/edit.tsx"),
      route(":id/delete", "routes/manage/events/delete.tsx"),
    ]),
    ...prefix("companies", [
      index("routes/manage/companies/index.tsx"),
      route("new", "routes/manage/companies/new.tsx"),
      route(":id", "routes/manage/companies/edit.tsx"),
      route(":id/delete", "routes/manage/companies/delete.tsx"),
    ]),
    ...prefix("groups", [
      index("routes/manage/groups/index.tsx"),
      route("new", "routes/manage/groups/new.tsx"),
      route(":id", "routes/manage/groups/edit.tsx"),
      route(":id/delete", "routes/manage/groups/delete.tsx"),
    ]),
    ...prefix("learning", [
      index("routes/manage/learning/index.tsx"),
      route("new", "routes/manage/learning/new.tsx"),
      route(":id", "routes/manage/learning/edit.tsx"),
      route(":id/delete", "routes/manage/learning/delete.tsx"),
    ]),
    ...prefix("people", [
      index("routes/manage/people/index.tsx"),
      route("new", "routes/manage/people/new.tsx"),
      route(":id", "routes/manage/people/edit.tsx"),
      route(":id/delete", "routes/manage/people/delete.tsx"),
    ]),
    ...prefix("news", [
      index("routes/manage/news/index.tsx"),
      route("new", "routes/manage/news/new.tsx"),
      route(":id", "routes/manage/news/edit.tsx"),
      route(":id/delete", "routes/manage/news/delete.tsx"),
    ]),
    ...prefix("jobs", [
      index("routes/manage/jobs/index.tsx"),
      route("new", "routes/manage/jobs/new.tsx"),
      route(":id", "routes/manage/jobs/edit.tsx"),
      route(":id/delete", "routes/manage/jobs/delete.tsx"),
    ]),
    ...prefix("projects", [
      index("routes/manage/projects/index.tsx"),
      route("new", "routes/manage/projects/new.tsx"),
      route(":id", "routes/manage/projects/edit.tsx"),
      route(":id/delete", "routes/manage/projects/delete.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
