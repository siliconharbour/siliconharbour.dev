-- Job Import Sources - Track ATS connections per company
CREATE TABLE `job_import_sources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `company_id` integer NOT NULL REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `source_type` text NOT NULL,
  `source_identifier` text NOT NULL,
  `source_url` text,
  `last_fetched_at` integer,
  `fetch_status` text,
  `fetch_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE INDEX `job_import_sources_company_idx` ON `job_import_sources`(`company_id`);
--> statement-breakpoint

-- Imported Jobs - Track individual job postings with soft deletes
CREATE TABLE `imported_jobs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `company_id` integer NOT NULL REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `source_id` integer NOT NULL REFERENCES `job_import_sources`(`id`) ON DELETE CASCADE,
  `external_id` text NOT NULL,
  `title` text NOT NULL,
  `location` text,
  `department` text,
  `description_html` text,
  `description_text` text,
  `url` text,
  `workplace_type` text,
  `posted_at` integer,
  `external_updated_at` integer,
  `first_seen_at` integer NOT NULL,
  `last_seen_at` integer NOT NULL,
  `removed_at` integer,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE INDEX `imported_jobs_status_idx` ON `imported_jobs`(`status`);
--> statement-breakpoint

CREATE INDEX `imported_jobs_company_idx` ON `imported_jobs`(`company_id`);
--> statement-breakpoint

CREATE INDEX `imported_jobs_source_external_idx` ON `imported_jobs`(`source_id`, `external_id`);
--> statement-breakpoint

-- Job Technology Mentions - Track tech extracted from job descriptions
CREATE TABLE `job_technology_mentions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `imported_job_id` integer NOT NULL REFERENCES `imported_jobs`(`id`) ON DELETE CASCADE,
  `technology_id` integer NOT NULL REFERENCES `technologies`(`id`) ON DELETE CASCADE,
  `confidence` integer,
  `context` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE INDEX `job_tech_mentions_job_idx` ON `job_technology_mentions`(`imported_job_id`);
--> statement-breakpoint

CREATE INDEX `job_tech_mentions_tech_idx` ON `job_technology_mentions`(`technology_id`);
