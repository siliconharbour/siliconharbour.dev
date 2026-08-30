CREATE TABLE `event_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_tags_slug_unique` ON `event_tags` (`slug`);
--> statement-breakpoint
CREATE TABLE `event_tag_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `event_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_tag_assignments_event_id_idx` ON `event_tag_assignments` (`event_id`);
--> statement-breakpoint
CREATE INDEX `event_tag_assignments_tag_id_idx` ON `event_tag_assignments` (`tag_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_tag_assignments_event_tag_unique` ON `event_tag_assignments` (`event_id`,`tag_id`);
