CREATE TABLE `discord_destinations` (
  `id`           integer PRIMARY KEY AUTOINCREMENT,
  `channel_type` text NOT NULL,
  `guild_id`     text NOT NULL,
  `guild_name`   text NOT NULL,
  `channel_id`   text NOT NULL,
  `channel_name` text NOT NULL,
  `created_at`   integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_destinations_type_channel_unique`
  ON `discord_destinations`(`channel_type`, `channel_id`);
--> statement-breakpoint
CREATE INDEX `discord_destinations_type_idx`
  ON `discord_destinations`(`channel_type`);
--> statement-breakpoint
ALTER TABLE `discord_posts` ADD `discord_guild_id` text;
--> statement-breakpoint
ALTER TABLE `discord_posts` ADD `batch_id` text;
--> statement-breakpoint
CREATE INDEX `discord_posts_batch_id_idx` ON `discord_posts`(`batch_id`);
--> statement-breakpoint
DELETE FROM `site_config` WHERE `key` IN ('discord_events_channel_id', 'discord_jobs_channel_id');
