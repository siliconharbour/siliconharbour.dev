CREATE TABLE `event_occurrences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`occurrence_date` integer NOT NULL,
	`location` text,
	`description` text,
	`link` text,
	`start_time` text,
	`end_time` text,
	`cancelled` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_occurrences_event_date_idx` ON `event_occurrences` (`event_id`,`occurrence_date`);--> statement-breakpoint
ALTER TABLE `events` ADD `recurrence_rule` text;--> statement-breakpoint
ALTER TABLE `events` ADD `recurrence_end` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `default_start_time` text;--> statement-breakpoint
ALTER TABLE `events` ADD `default_end_time` text;