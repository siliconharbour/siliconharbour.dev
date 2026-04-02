CREATE TABLE `event_import_sources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `group_id` integer REFERENCES `groups`(`id`),
  `source_type` text NOT NULL,
  `source_identifier` text NOT NULL,
  `source_url` text NOT NULL,
  `last_fetched_at` integer,
  `fetch_status` text NOT NULL DEFAULT 'pending',
  `fetch_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `events` ADD `import_source_id` integer REFERENCES `event_import_sources`(`id`);
--> statement-breakpoint
ALTER TABLE `events` ADD `external_id` text;
--> statement-breakpoint
ALTER TABLE `events` ADD `import_status` text;
--> statement-breakpoint
ALTER TABLE `events` ADD `first_seen_at` integer;
--> statement-breakpoint
ALTER TABLE `events` ADD `last_seen_at` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `events_import_source_external_id_unique`
  ON `events` (`import_source_id`, `external_id`)
  WHERE `import_source_id` IS NOT NULL AND `external_id` IS NOT NULL;
