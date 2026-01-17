CREATE TABLE `import_blocklist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`reason` text,
	`blocked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blocklist_source_external_idx` ON `import_blocklist` (`source`,`external_id`);
