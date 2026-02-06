-- Add is_technical column to jobs table
-- Defaults to true (technical), non-technical jobs are deprioritized in UI
ALTER TABLE `jobs` ADD `is_technical` integer NOT NULL DEFAULT 1;
