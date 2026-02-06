-- Technologies master list
CREATE TABLE `technologies` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `category` text NOT NULL,
  `description` text,
  `website` text,
  `icon` text,
  `visible` integer DEFAULT true NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX `technologies_slug_unique` ON `technologies` (`slug`);
--> statement-breakpoint

-- Technology assignments (links technologies to companies/projects)
CREATE TABLE `technology_assignments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `technology_id` integer NOT NULL REFERENCES `technologies`(`id`) ON DELETE CASCADE,
  `content_type` text NOT NULL,
  `content_id` integer NOT NULL,
  `source` text,
  `source_url` text,
  `last_verified` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE INDEX `tech_assignments_tech_idx` ON `technology_assignments` (`technology_id`);
--> statement-breakpoint

CREATE INDEX `tech_assignments_content_idx` ON `technology_assignments` (`content_type`, `content_id`);
--> statement-breakpoint

CREATE UNIQUE INDEX `tech_assignments_unique_idx` ON `technology_assignments` (`technology_id`, `content_type`, `content_id`);
