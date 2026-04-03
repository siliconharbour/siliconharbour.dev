ALTER TABLE `event_import_sources` ADD `organizer` text;
--> statement-breakpoint
ALTER TABLE `event_import_sources` DROP COLUMN `group_id`;
