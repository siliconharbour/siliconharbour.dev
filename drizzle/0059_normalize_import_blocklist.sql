UPDATE `import_blocklist` SET `external_id` = normalize_block_key(`source`, `external_id`);
--> statement-breakpoint
UPDATE `import_blocklist` AS `target` SET
  `blocked_at` = (SELECT MIN(`blocked_at`) FROM `import_blocklist` WHERE `source` = `target`.`source` AND `external_id` = `target`.`external_id`),
  `reason` = COALESCE((SELECT `reason` FROM `import_blocklist` WHERE `source` = `target`.`source` AND `external_id` = `target`.`external_id` AND LENGTH(TRIM(`reason`)) > 0 ORDER BY LENGTH(TRIM(`reason`)) DESC, `blocked_at`, `id` LIMIT 1), `reason`);
--> statement-breakpoint
DELETE FROM `import_blocklist` WHERE `id` NOT IN (SELECT MIN(`id`) FROM `import_blocklist` GROUP BY `source`, `external_id`);
--> statement-breakpoint
DROP INDEX `blocklist_source_external_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `blocklist_source_external_idx` ON `import_blocklist` (`source`, `external_id`);
