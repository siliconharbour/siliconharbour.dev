-- Unify jobs tables: drop old jobs table, rename imported_jobs to jobs
-- The old jobs table is empty, so no data migration needed

-- 1. Drop old jobs FTS table and triggers
DROP TRIGGER IF EXISTS `jobs_ai`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `jobs_ad`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `jobs_au`;
--> statement-breakpoint
DROP TABLE IF EXISTS `jobs_fts`;
--> statement-breakpoint

-- 2. Drop old jobs table
DROP TABLE IF EXISTS `jobs`;
--> statement-breakpoint

-- 3. Rename imported_jobs to jobs
ALTER TABLE `imported_jobs` RENAME TO `jobs`;
--> statement-breakpoint

-- 4. Add new columns for manual job support
-- source_type: 'manual' or 'imported' (null treated as imported for existing rows)
ALTER TABLE `jobs` ADD `source_type` text DEFAULT 'imported';
--> statement-breakpoint

-- description field for manual jobs (imported jobs use descriptionHtml/descriptionText)
ALTER TABLE `jobs` ADD `description` text;
--> statement-breakpoint

-- salary_range for manual jobs
ALTER TABLE `jobs` ADD `salary_range` text;
--> statement-breakpoint

-- slug for URL generation (manual jobs need this, imported jobs can use it too)
ALTER TABLE `jobs` ADD `slug` text;
--> statement-breakpoint

-- 5. Recreate indexes with new table name
DROP INDEX IF EXISTS `imported_jobs_status_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `imported_jobs_company_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `imported_jobs_source_external_idx`;
--> statement-breakpoint

CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);
--> statement-breakpoint
CREATE INDEX `jobs_company_idx` ON `jobs` (`company_id`);
--> statement-breakpoint
CREATE INDEX `jobs_source_external_idx` ON `jobs` (`source_id`, `external_id`);
--> statement-breakpoint
CREATE INDEX `jobs_slug_idx` ON `jobs` (`slug`);
--> statement-breakpoint

-- 6. Create new FTS table for unified jobs search
CREATE VIRTUAL TABLE `jobs_fts` USING fts5(
  `title`,
  `description`,
  `location`,
  `department`,
  content='jobs',
  content_rowid='id',
  tokenize='trigram'
);
--> statement-breakpoint

-- 7. Create triggers for FTS sync
CREATE TRIGGER `jobs_ai` AFTER INSERT ON `jobs` BEGIN
  INSERT INTO `jobs_fts`(`rowid`, `title`, `description`, `location`, `department`)
  VALUES (NEW.`id`, NEW.`title`, COALESCE(NEW.`description`, NEW.`description_text`, ''), NEW.`location`, NEW.`department`);
END;
--> statement-breakpoint

CREATE TRIGGER `jobs_ad` AFTER DELETE ON `jobs` BEGIN
  INSERT INTO `jobs_fts`(`jobs_fts`, `rowid`, `title`, `description`, `location`, `department`)
  VALUES ('delete', OLD.`id`, OLD.`title`, COALESCE(OLD.`description`, OLD.`description_text`, ''), OLD.`location`, OLD.`department`);
END;
--> statement-breakpoint

CREATE TRIGGER `jobs_au` AFTER UPDATE ON `jobs` BEGIN
  INSERT INTO `jobs_fts`(`jobs_fts`, `rowid`, `title`, `description`, `location`, `department`)
  VALUES ('delete', OLD.`id`, OLD.`title`, COALESCE(OLD.`description`, OLD.`description_text`, ''), OLD.`location`, OLD.`department`);
  INSERT INTO `jobs_fts`(`rowid`, `title`, `description`, `location`, `department`)
  VALUES (NEW.`id`, NEW.`title`, COALESCE(NEW.`description`, NEW.`description_text`, ''), NEW.`location`, NEW.`department`);
END;
--> statement-breakpoint

-- 8. Populate FTS with existing data
INSERT INTO `jobs_fts`(`rowid`, `title`, `description`, `location`, `department`)
SELECT `id`, `title`, COALESCE(`description`, `description_text`, ''), `location`, `department` FROM `jobs`;
