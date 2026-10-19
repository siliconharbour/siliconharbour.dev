CREATE TABLE `theme_shares` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `theme` text NOT NULL,
  `logo` blob,
  `logo_bytes` integer DEFAULT 0 NOT NULL,
  `edit_key_hash` text NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `created_ip` text NOT NULL,
  `updated_ip` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `theme_shares_created_idx` ON `theme_shares` (`created_at`);
