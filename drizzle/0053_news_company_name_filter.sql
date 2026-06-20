ALTER TABLE `companies` ADD `news_filter_include` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `news_import_sources` ADD `use_company_name_filter` integer NOT NULL DEFAULT 0;
