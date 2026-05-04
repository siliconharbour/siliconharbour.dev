ALTER TABLE `news_import_sources` ADD `entity_url` text;
--> statement-breakpoint
ALTER TABLE `news` ADD `source_entity_url` text;
