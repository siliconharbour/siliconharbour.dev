CREATE TABLE `rejected_records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `type` text NOT NULL,
  `entity_id` integer NOT NULL,
  `name` text NOT NULL,
  `was_visible` integer NOT NULL,
  `block_source` text,
  `block_key` text,
  `rejected_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rejected_records_entity_unique` ON `rejected_records` (`type`, `entity_id`);
