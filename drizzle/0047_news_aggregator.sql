-- Migration: News aggregator schema
-- Drop old empty news table and recreate with link/article types,
-- status workflow, and import source tracking.

-- Drop existing triggers first
DROP TRIGGER IF EXISTS news_ai;
--> statement-breakpoint
DROP TRIGGER IF EXISTS news_ad;
--> statement-breakpoint
DROP TRIGGER IF EXISTS news_au;
--> statement-breakpoint

-- Drop old FTS table
DROP TABLE IF EXISTS `news_fts`;
--> statement-breakpoint

-- Drop old news table (empty in production)
DROP TABLE IF EXISTS `news`;
--> statement-breakpoint

-- Create news import sources table
CREATE TABLE `news_import_sources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `source_type` text NOT NULL DEFAULT 'rss',
  `source_url` text NOT NULL,
  `source_identifier` text,
  `keywords` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `last_sync_at` integer,
  `last_sync_status` text,
  `last_sync_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

-- Create new news table
CREATE TABLE `news` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `slug` text NOT NULL,
  `type` text NOT NULL DEFAULT 'link',
  `title` text NOT NULL,
  `external_url` text,
  `source_name` text,
  `content` text NOT NULL DEFAULT '',
  `excerpt` text,
  `cover_image` text,
  `published_at` integer,
  `status` text NOT NULL DEFAULT 'draft',
  `source_id` integer REFERENCES `news_import_sources`(`id`) ON DELETE SET NULL,
  `source_item_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

-- Unique constraint on slug
CREATE UNIQUE INDEX `news_slug_unique` ON `news`(`slug`);
--> statement-breakpoint

-- Index for deduplication
CREATE INDEX `news_source_dedup` ON `news`(`source_id`, `source_item_id`);
--> statement-breakpoint

-- Index for listing queries
CREATE INDEX `news_status_published` ON `news`(`status`, `published_at`);
--> statement-breakpoint

-- Rebuild FTS with trigram tokenizer
CREATE VIRTUAL TABLE IF NOT EXISTS `news_fts` USING fts5(title, content='news', content_rowid='id', tokenize='trigram');
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS news_ai AFTER INSERT ON `news` BEGIN
  INSERT INTO news_fts(rowid, title) VALUES (new.id, new.title);
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS news_ad AFTER DELETE ON `news` BEGIN
  INSERT INTO news_fts(news_fts, rowid, title) VALUES('delete', old.id, old.title);
END;
--> statement-breakpoint

CREATE TRIGGER IF NOT EXISTS news_au AFTER UPDATE ON `news` BEGIN
  INSERT INTO news_fts(news_fts, rowid, title) VALUES('delete', old.id, old.title);
  INSERT INTO news_fts(rowid, title) VALUES (new.id, new.title);
END;
