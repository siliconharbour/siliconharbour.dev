-- Allow manual job creation by making source_id, company_id, and external_id nullable.
-- SQLite doesn't support ALTER COLUMN, so we recreate the table.
--
-- IMPORTANT: discord_post_items has an ON DELETE SET NULL FK to jobs.job_id.
-- Dropping the old jobs table triggers that cascade even with foreign_keys=OFF
-- (SQLite implements ON DELETE SET NULL via hidden triggers that fire regardless).
-- We save and restore the FK references around the drop/rename.
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

-- Save discord_post_items job_id references before dropping the old table
CREATE TEMP TABLE `_discord_job_ids_backup` AS
  SELECT `id`, `job_id` FROM `discord_post_items` WHERE `job_id` IS NOT NULL;--> statement-breakpoint

DROP TABLE `jobs`;--> statement-breakpoint

ALTER TABLE `jobs_new` RENAME TO `jobs`;--> statement-breakpoint

-- Restore discord_post_items job_id references
UPDATE `discord_post_items` SET `job_id` = (
  SELECT `job_id` FROM `_discord_job_ids_backup` WHERE `_discord_job_ids_backup`.`id` = `discord_post_items`.`id`
) WHERE `id` IN (SELECT `id` FROM `_discord_job_ids_backup`);--> statement-breakpoint

DROP TABLE `_discord_job_ids_backup`;--> statement-breakpoint

CREATE INDEX `jobs_company_id_idx` ON `jobs` (`company_id`);--> statement-breakpoint
CREATE INDEX `jobs_source_external_idx` ON `jobs` (`source_id`, `external_id`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_slug_unique` ON `jobs` (`slug`);--> statement-breakpoint

PRAGMA foreign_keys=ON;
