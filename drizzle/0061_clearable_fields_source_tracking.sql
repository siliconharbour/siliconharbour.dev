PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`bio` text,
	`website` text,
	`avatar` text,
	`social_links` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `github` text, visible INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
INSERT INTO `__new_people` (`id`, `slug`, `name`, `bio`, `website`, `avatar`, `social_links`, `created_at`, `updated_at`, `github`, `visible`) SELECT `id`, `slug`, `name`, CASE WHEN trim(`bio`, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) = '' THEN NULL ELSE `bio` END, `website`, `avatar`, `social_links`, `created_at`, `updated_at`, `github`, `visible` FROM `people`;
--> statement-breakpoint
DROP TABLE `people`;
--> statement-breakpoint
ALTER TABLE `__new_people` RENAME TO `people`;
--> statement-breakpoint
CREATE UNIQUE INDEX `people_slug_unique` ON `people` (`slug`);
--> statement-breakpoint
CREATE TRIGGER people_ai AFTER INSERT ON people BEGIN
  INSERT INTO people_fts(rowid, name, bio)
  VALUES (NEW.id, NEW.name, NEW.bio);
END;
--> statement-breakpoint
CREATE TRIGGER people_ad AFTER DELETE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, bio)
  VALUES ('delete', OLD.id, OLD.name, OLD.bio);
END;
--> statement-breakpoint
CREATE TRIGGER people_au AFTER UPDATE ON people BEGIN
  INSERT INTO people_fts(people_fts, rowid, name, bio)
  VALUES ('delete', OLD.id, OLD.name, OLD.bio);
  INSERT INTO people_fts(rowid, name, bio)
  VALUES (NEW.id, NEW.name, NEW.bio);
END;
--> statement-breakpoint
INSERT INTO `people_fts` (`people_fts`) VALUES ('rebuild');
--> statement-breakpoint
CREATE TABLE `__new_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`location` text,
	`link` text,
	`organizer` text,
	`cover_image` text,
	`icon_image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `recurrence_rule` text, `recurrence_end` integer, `default_start_time` text, `default_end_time` text, `requires_signup` integer NOT NULL DEFAULT 0, `recurrence_start` integer, `import_source_id` integer REFERENCES `event_import_sources`(`id`), `external_id` text, `import_status` text, `first_seen_at` integer, `last_seen_at` integer, `cover_image_url` text, `time_mode` text NOT NULL DEFAULT 'scheduled', `parent_event_id` integer REFERENCES `events`(`id`) ON DELETE SET NULL);
--> statement-breakpoint
INSERT INTO `__new_events` (`id`, `slug`, `title`, `description`, `location`, `link`, `organizer`, `cover_image`, `icon_image`, `created_at`, `updated_at`, `recurrence_rule`, `recurrence_end`, `default_start_time`, `default_end_time`, `requires_signup`, `recurrence_start`, `import_source_id`, `external_id`, `import_status`, `first_seen_at`, `last_seen_at`, `cover_image_url`, `time_mode`, `parent_event_id`) SELECT `id`, `slug`, `title`, `description`, `location`, CASE WHEN trim(`link`, char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) = '' THEN NULL ELSE `link` END, `organizer`, `cover_image`, `icon_image`, `created_at`, `updated_at`, `recurrence_rule`, `recurrence_end`, `default_start_time`, `default_end_time`, `requires_signup`, `recurrence_start`, `import_source_id`, `external_id`, `import_status`, `first_seen_at`, `last_seen_at`, `cover_image_url`, `time_mode`, `parent_event_id` FROM `events`;
--> statement-breakpoint
DROP TABLE `events`;
--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);
--> statement-breakpoint
CREATE TRIGGER events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, title, description, organizer, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.organizer, NEW.location);
END;
--> statement-breakpoint
CREATE TRIGGER events_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, description, organizer, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.organizer, OLD.location);
END;
--> statement-breakpoint
CREATE TRIGGER events_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, title, description, organizer, location)
  VALUES ('delete', OLD.id, OLD.title, OLD.description, OLD.organizer, OLD.location);
  INSERT INTO events_fts(rowid, title, description, organizer, location)
  VALUES (NEW.id, NEW.title, NEW.description, NEW.organizer, NEW.location);
END;
--> statement-breakpoint
CREATE UNIQUE INDEX `events_import_source_external_id_unique`
  ON `events` (`import_source_id`, `external_id`)
  WHERE `import_source_id` IS NOT NULL AND `external_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `events_import_status_idx` ON `events` (`import_status`);
--> statement-breakpoint
CREATE INDEX `events_parent_event_id_idx` ON `events` (`parent_event_id`);
--> statement-breakpoint
INSERT INTO `events_fts` (`events_fts`) VALUES ('rebuild');
--> statement-breakpoint
ALTER TABLE `companies` ADD `technl_external_id` text;
--> statement-breakpoint
ALTER TABLE `companies` ADD `technl_last_seen_at` integer;
--> statement-breakpoint
ALTER TABLE `companies` ADD `genesis_external_id` text;
--> statement-breakpoint
ALTER TABLE `companies` ADD `genesis_last_seen_at` integer;
--> statement-breakpoint
ALTER TABLE `companies` ADD `bounce_external_id` text;
--> statement-breakpoint
ALTER TABLE `companies` ADD `bounce_last_seen_at` integer;
--> statement-breakpoint
ALTER TABLE `education` ADD `technl_external_id` text;
--> statement-breakpoint
ALTER TABLE `education` ADD `technl_last_seen_at` integer;
--> statement-breakpoint
ALTER TABLE `education` ADD `genesis_external_id` text;
--> statement-breakpoint
ALTER TABLE `education` ADD `genesis_last_seen_at` integer;
--> statement-breakpoint
ALTER TABLE `education` ADD `bounce_external_id` text;
--> statement-breakpoint
ALTER TABLE `education` ADD `bounce_last_seen_at` integer;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
