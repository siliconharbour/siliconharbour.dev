import { type RouteConfig, index, route, prefix, layout } from "@react-router/dev/routes";

export default [
  // Static routes (no layout needed)
  route("images/:filename", "routes/images.tsx"),
  route("calendar.ics", "routes/calendar-ics.tsx"),
  
  // OG images for social sharing
  route("events/:slug.png", "routes/events-og.tsx"),
  route("news/:slug.png", "routes/news-og.tsx"),
  
  // RSS feeds (no layout needed)
  route("export.zip", "routes/export.tsx"),
  route("feed.rss", "routes/feed-rss.tsx"),
  route("events.rss", "routes/events-rss.tsx"),
  route("news.rss", "routes/news-rss.tsx"),
  route("jobs.rss", "routes/jobs-rss.tsx"),
  
  // API routes
  route("api/comments", "routes/api.comments.tsx"),
  route("api/comments/delete", "routes/api.comments.delete.tsx"),
  
  // Public JSON API
  route("api/companies", "routes/api/companies.tsx"),
  route("api/companies/:slug", "routes/api/companies.$slug.tsx"),
  route("api/events", "routes/api/events.tsx"),
  route("api/events/:slug", "routes/api/events.$slug.tsx"),
  route("api/groups", "routes/api/groups.tsx"),
  route("api/groups/:slug", "routes/api/groups.$slug.tsx"),
  route("api/jobs", "routes/api/jobs.tsx"),
  route("api/jobs/:slug", "routes/api/jobs.$slug.tsx"),
  route("api/education", "routes/api/education.tsx"),
  route("api/education/:slug", "routes/api/education.$slug.tsx"),
  route("api/news", "routes/api/news.tsx"),
  route("api/news/:slug", "routes/api/news.$slug.tsx"),
  route("api/people", "routes/api/people.tsx"),
  route("api/people/:slug", "routes/api/people.$slug.tsx"),
  route("api/projects", "routes/api/projects.tsx"),
  route("api/projects/:slug", "routes/api/projects.$slug.tsx"),
  route("api/products", "routes/api/products.tsx"),
  route("api/products/:slug", "routes/api/products.$slug.tsx"),
  
  // Home page has its own hero header design
  index("routes/home.tsx"),
  
  // Public routes with shared layout (header/footer with visibility config)
  layout("routes/public-layout.tsx", [
    route("about", "routes/about.tsx"),
    route("conduct", "routes/conduct.tsx"),
    route("stay-connected", "routes/stay-connected.tsx"),
    
    // Consolidated directory pages with tab layout
    layout("routes/directory/layout.tsx", [
      route("directory", "routes/directory/companies.tsx", { id: "directory-index" }),
      route("directory/companies", "routes/directory/companies.tsx"),
      route("directory/groups", "routes/directory/groups.tsx"),
      route("directory/people", "routes/directory/people.tsx"),
      route("directory/products", "routes/directory/products.tsx"),
      route("directory/projects", "routes/directory/projects.tsx"),
      route("directory/education", "routes/directory/education.tsx"),
    ]),
    
    // Directory detail pages (outside tab layout for full-width content)
    route("directory/companies/:slug", "routes/directory/companies.$slug.tsx"),
    route("directory/groups/:slug", "routes/directory/groups.$slug.tsx"),
    route("directory/people/:slug", "routes/directory/people.$slug.tsx"),
    route("directory/products/:slug", "routes/directory/products.$slug.tsx"),
    route("directory/projects/:slug", "routes/directory/projects.$slug.tsx"),
    route("directory/education/:slug", "routes/directory/education.$slug.tsx"),
    
    // Events (realtime content, separate from directory)
    ...prefix("events", [
      index("routes/events/index.tsx"),
      route(":slug", "routes/events/detail.tsx"),
    ]),
    
    // News (realtime content, separate from directory)
    layout("routes/news/layout.tsx", [
      route("news", "routes/news/all.tsx", { id: "news-index" }),
      route("news/announcements", "routes/news/announcements.tsx"),
      route("news/general", "routes/news/general.tsx"),
      route("news/editorial", "routes/news/editorial.tsx"),
      route("news/updates", "routes/news/updates.tsx"),
    ]),
    
    // News detail pages (outside layout for full-width content)
    route("news/:slug", "routes/news/detail.tsx"),
    
    // Jobs (separate from directory)
    ...prefix("jobs", [
      index("routes/jobs/index.tsx"),
      route(":slug", "routes/jobs/detail.tsx"),
    ]),
  ]),
  
  // Admin routes
  ...prefix("manage", [
    route("login", "routes/manage/login.tsx"),
    route("logout", "routes/manage/logout.tsx"),
    index("routes/manage/index.tsx"),
    route("settings", "routes/manage/settings.tsx"),
    route("comments", "routes/manage/comments.tsx"),
    ...prefix("events", [
      index("routes/manage/events/index.tsx"),
      route("new", "routes/manage/events/new.tsx"),
      route(":id", "routes/manage/events/edit.tsx"),
      route(":id/delete", "routes/manage/events/delete.tsx"),
      route(":id/occurrences", "routes/manage/events/occurrences.tsx"),
    ]),
    ...prefix("companies", [
      index("routes/manage/companies/index.tsx"),
      route("review", "routes/manage/companies/review.tsx"),
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
    ...prefix("education", [
      index("routes/manage/education/index.tsx"),
      route("new", "routes/manage/education/new.tsx"),
      route(":id", "routes/manage/education/edit.tsx"),
      route(":id/delete", "routes/manage/education/delete.tsx"),
    ]),
    ...prefix("people", [
      index("routes/manage/people/index.tsx"),
      route("review", "routes/manage/people/review.tsx"),
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
    ...prefix("products", [
      index("routes/manage/products/index.tsx"),
      route("new", "routes/manage/products/new.tsx"),
      route(":id", "routes/manage/products/edit.tsx"),
      route(":id/delete", "routes/manage/products/delete.tsx"),
    ]),
    ...prefix("import", [
      route("technl", "routes/manage/import/technl.tsx"),
      route("genesis", "routes/manage/import/genesis.tsx"),
      route("github", "routes/manage/import/github.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
