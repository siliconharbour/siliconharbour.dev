ALTER TABLE `events` ADD `time_mode` text NOT NULL DEFAULT 'scheduled';--> statement-breakpoint
ALTER TABLE `events` ADD `parent_event_id` integer REFERENCES `events`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `events_parent_event_id_idx` ON `events` (`parent_event_id`);
