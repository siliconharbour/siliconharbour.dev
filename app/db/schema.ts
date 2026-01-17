import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// =============================================================================
// Auth tables
// =============================================================================

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["regular", "admin"] }).notNull().default("regular"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// =============================================================================
// Content types - all follow a similar pattern with slug, markdown content, timestamps
// =============================================================================

// Content type enum for the references table
export const contentTypes = ["event", "company", "group", "learning", "person", "news", "job", "project"] as const;
export type ContentType = typeof contentTypes[number];

// Events - tech meetups, conferences, workshops
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(), // markdown
  location: text("location"),
  link: text("link").notNull(), // external link
  organizer: text("organizer"),
  coverImage: text("cover_image"),
  iconImage: text("icon_image"),
  // Recurrence fields
  recurrenceRule: text("recurrence_rule"), // RRULE format: "FREQ=WEEKLY;BYDAY=TH"
  recurrenceEnd: integer("recurrence_end", { mode: "timestamp" }), // When recurrence stops (null = indefinite)
  defaultStartTime: text("default_start_time"), // HH:mm format for recurring events
  defaultEndTime: text("default_end_time"), // HH:mm format for recurring events
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const eventDates = sqliteTable("event_dates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  startDate: integer("start_date", { mode: "timestamp" }).notNull(),
  endDate: integer("end_date", { mode: "timestamp" }),
});

// Event occurrence overrides - for per-occurrence customization of recurring events
export const eventOccurrences = sqliteTable("event_occurrences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  occurrenceDate: integer("occurrence_date", { mode: "timestamp" }).notNull(), // The date this occurrence falls on
  // Override fields (null = use base event value)
  location: text("location"),
  description: text("description"),
  link: text("link"),
  startTime: text("start_time"), // HH:mm format override
  endTime: text("end_time"), // HH:mm format override
  cancelled: integer("cancelled", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  eventDateIdx: index("event_occurrences_event_date_idx").on(table.eventId, table.occurrenceDate),
}));

// Companies - local tech companies
export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(), // markdown
  website: text("website"), // external link
  wikipedia: text("wikipedia"), // wikipedia article URL
  email: text("email"), // contact email
  location: text("location"),
  founded: text("founded"), // year as string, flexible format
  logo: text("logo"), // image filename
  coverImage: text("cover_image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Groups - meetups, communities, organizations
export const groups = sqliteTable("groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(), // markdown
  website: text("website"), // external link (meetup.com, discord, etc.)
  meetingFrequency: text("meeting_frequency"), // e.g., "Weekly", "Monthly", "First Tuesday"
  logo: text("logo"),
  coverImage: text("cover_image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Learning - educational institutions and resources
export const learning = sqliteTable("learning", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(), // markdown
  website: text("website"), // external link
  type: text("type", { 
    enum: ["university", "college", "bootcamp", "online", "other"] 
  }).notNull().default("other"),
  logo: text("logo"),
  coverImage: text("cover_image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// People - community members, speakers, etc.
export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  bio: text("bio").notNull(), // markdown
  website: text("website"),
  avatar: text("avatar"), // image filename
  // Social links stored as JSON string
  socialLinks: text("social_links"), // JSON: { twitter?, github?, linkedin?, etc. }
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// News - announcements, articles, editorials
export const newsTypes = ["announcement", "editorial", "meta"] as const;
export type NewsType = typeof newsTypes[number];

export const news = sqliteTable("news", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  type: text("type", { enum: newsTypes }).notNull().default("announcement"),
  content: text("content").notNull(), // markdown
  excerpt: text("excerpt"), // short summary for lists/RSS
  coverImage: text("cover_image"),
  publishedAt: integer("published_at", { mode: "timestamp" }), // null = draft
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Jobs - employment opportunities
export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(), // markdown
  companyName: text("company_name"), // denormalized, can also use [[Company]] reference
  location: text("location"),
  remote: integer("remote", { mode: "boolean" }).notNull().default(false),
  salaryRange: text("salary_range"), // flexible text like "$80k-$100k" or "Competitive"
  applyLink: text("apply_link").notNull(), // external link
  postedAt: integer("posted_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }), // null = no expiry
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// =============================================================================
// Projects - community projects, apps, games, tools
// =============================================================================

export const projectTypes = ["game", "webapp", "library", "tool", "hardware", "other"] as const;
export type ProjectType = typeof projectTypes[number];

export const projectStatuses = ["active", "completed", "archived", "on-hold"] as const;
export type ProjectStatus = typeof projectStatuses[number];

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(), // markdown
  // Links as JSON: { github?, itchio?, website?, demo?, npm?, pypi?, steam?, etc. }
  links: text("links"), // JSON string
  type: text("type", { enum: projectTypes }).notNull().default("other"),
  status: text("status", { enum: projectStatuses }).notNull().default("active"),
  logo: text("logo"), // icon/avatar image
  coverImage: text("cover_image"), // primary cover photo
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Project gallery images
export const projectImages = sqliteTable("project_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  image: text("image").notNull(), // filename
  caption: text("caption"), // optional caption
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  projectIdx: index("project_images_project_idx").on(table.projectId),
}));

// =============================================================================
// Comments - anonymous user feedback on content
// =============================================================================

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Polymorphic relation to any content type
  contentType: text("content_type", { enum: contentTypes }).notNull(),
  contentId: integer("content_id").notNull(),
  // Comment data
  authorName: text("author_name"), // optional, for attribution
  content: text("content").notNull(),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false), // for webmaster-only feedback
  // Metadata for spam management
  ipAddress: text("ip_address"), // raw IP for admin spam cleanup
  ipHash: text("ip_hash"), // hashed IP for privacy-preserving rate limiting
  userAgent: text("user_agent"), // browser/client info for spam patterns
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  contentIdx: index("comments_content_idx").on(table.contentType, table.contentId),
  ipIdx: index("comments_ip_idx").on(table.ipAddress), // for finding all comments from an IP
}));

// =============================================================================
// Site Configuration - key-value settings
// =============================================================================

export const siteConfig = sqliteTable("site_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type SiteConfig = typeof siteConfig.$inferSelect;
export type NewSiteConfig = typeof siteConfig.$inferInsert;

// Section visibility keys
export const sectionKeys = [
  "events",
  "companies", 
  "groups",
  "projects",
  "learning",
  "people",
  "news",
  "jobs",
] as const;
export type SectionKey = typeof sectionKeys[number];

// =============================================================================
// References - [[link]] relationships between content
// =============================================================================

// Stores extracted [[references]] from markdown content
// Enables bidirectional queries: "what links to X" and "what does X link to"
export const references = sqliteTable("references", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Source content (the one containing the [[reference]])
  sourceType: text("source_type", { enum: contentTypes }).notNull(),
  sourceId: integer("source_id").notNull(),
  // Target content (the one being referenced)
  targetType: text("target_type", { enum: contentTypes }).notNull(),
  targetId: integer("target_id").notNull(),
  // The original reference text (for display/debugging)
  referenceText: text("reference_text").notNull(), // e.g., "Verafin" or "John Smith"
  // Optional relation metadata (e.g., "CEO", "Founder", "Organizer")
  // Used with syntax: [[{CEO} at {CoLab Software}]]
  relation: text("relation"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  sourceIdx: index("references_source_idx").on(table.sourceType, table.sourceId),
  targetIdx: index("references_target_idx").on(table.targetType, table.targetId),
}));

// =============================================================================
// Type exports
// =============================================================================

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export type Event = typeof events.$inferSelect;
export type EventDate = typeof eventDates.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type NewEventDate = typeof eventDates.$inferInsert;
export type EventOccurrence = typeof eventOccurrences.$inferSelect;
export type NewEventOccurrence = typeof eventOccurrences.$inferInsert;

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;

export type Learning = typeof learning.$inferSelect;
export type NewLearning = typeof learning.$inferInsert;

export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;

export type News = typeof news.$inferSelect;
export type NewNews = typeof news.$inferInsert;

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

export type Reference = typeof references.$inferSelect;
export type NewReference = typeof references.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type ProjectImage = typeof projectImages.$inferSelect;
export type NewProjectImage = typeof projectImages.$inferInsert;
