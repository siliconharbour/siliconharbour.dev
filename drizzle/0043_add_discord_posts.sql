CREATE TABLE `discord_posts` (
  `id`                   integer PRIMARY KEY AUTOINCREMENT,
  `channel_type`         text NOT NULL,
  `discord_message_id`   text,
  `discord_channel_id`   text NOT NULL,
  `intro_text`           text,
  `posted_at`            integer NOT NULL,
  `created_at`           integer NOT NULL
);

CREATE TABLE `discord_post_items` (
  `id`              integer PRIMARY KEY AUTOINCREMENT,
  `discord_post_id` integer NOT NULL REFERENCES `discord_posts`(`id`) ON DELETE CASCADE,
  `item_type`       text NOT NULL,
  `event_id`        integer REFERENCES `events`(`id`) ON DELETE SET NULL,
  `job_id`          integer REFERENCES `jobs`(`id`) ON DELETE SET NULL,
  `skipped`         integer NOT NULL DEFAULT 0
);

CREATE INDEX `discord_post_items_event_id_idx` ON `discord_post_items`(`event_id`);
CREATE INDEX `discord_post_items_job_id_idx` ON `discord_post_items`(`job_id`);
CREATE INDEX `discord_post_items_discord_post_id_idx` ON `discord_post_items`(`discord_post_id`);
