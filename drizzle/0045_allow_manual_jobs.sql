-- Allow manual job creation by making source_id, company_id, and external_id nullable.
-- SQLite doesn't support ALTER COLUMN, so we recreate the table.
PRAGMA foreign_keys=OFF;--> statement-breakpoint

CREATE TABLE `jobs_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `company_id` integer REFERENCES `companies`(`id`) ON DELETE CASCADE,
  `source_id` integer REFERENCES `job_import_sources`(`id`) ON DELETE CASCADE,
  `external_id` text,
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
  `updated_at` integer NOT NULL,
  `source_type` text DEFAULT 'imported',
  `description` text,
  `salary_range` text,
  `slug` text,
  `is_technical` integer NOT NULL DEFAULT 1
);--> statement-breakpoint

INSERT INTO `jobs_new` SELECT * FROM `jobs`;--> statement-breakpoint

DROP TABLE `jobs`;--> statement-breakpoint

ALTER TABLE `jobs_new` RENAME TO `jobs`;--> statement-breakpoint

CREATE INDEX `jobs_company_id_idx` ON `jobs` (`company_id`);--> statement-breakpoint
CREATE INDEX `jobs_source_external_idx` ON `jobs` (`source_id`, `external_id`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_slug_unique` ON `jobs` (`slug`);--> statement-breakpoint

PRAGMA foreign_keys=ON;
