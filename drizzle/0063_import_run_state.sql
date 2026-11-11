ALTER TABLE `import_jobs` ADD `run_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `import_jobs` SET `run_id` = lower(hex(randomblob(16)));
--> statement-breakpoint
ALTER TABLE `import_jobs` ADD `pause_reason` text;
--> statement-breakpoint
ALTER TABLE `import_jobs` ADD `payload` text;
--> statement-breakpoint
UPDATE `import_jobs` SET `status` = 'failed', `last_error` = 'Following import data is unavailable. Start a new import.' WHERE `id` = 'github-following';
--> statement-breakpoint
UPDATE `import_jobs` SET `pause_reason` = CASE WHEN `rate_limit_reset` IS NOT NULL THEN 'rate_limit' ELSE 'user' END WHERE `status` = 'paused';
--> statement-breakpoint
UPDATE `import_jobs` SET `status` = 'failed' WHERE `status` = 'error';
