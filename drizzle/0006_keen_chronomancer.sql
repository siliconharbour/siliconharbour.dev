CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_type` text NOT NULL,
	`content_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_url` text,
	`source_id` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sources_content_idx` ON `sources` (`content_type`,`content_id`);--> statement-breakpoint
CREATE INDEX `sources_source_idx` ON `sources` (`source_type`,`source_id`);--> statement-breakpoint
ALTER TABLE `companies` ADD `email` text;