ALTER TABLE `people` RENAME COLUMN `social_links` TO `external_links`;
--> statement-breakpoint
UPDATE `people`
SET `external_links` = nullif(json_patch(coalesce(`external_links`, '{}'), json_object('github', nullif(trim(`github`), ''))), '{}');
--> statement-breakpoint
ALTER TABLE `people` DROP COLUMN `github`;
--> statement-breakpoint
ALTER TABLE `companies` ADD `external_links` text;
--> statement-breakpoint
UPDATE `companies`
SET `external_links` = nullif(json_patch('{}', json_object(
  'github', nullif(trim(`github`), ''),
  'wikipedia', nullif(trim(`wikipedia`), ''),
  'linkedin', CASE
    WHEN trim(`linkedin`) LIKE 'https://www.linkedin.com/%'
      THEN 'https://linkedin.com/' || substr(trim(`linkedin`), 26)
    ELSE nullif(trim(`linkedin`), '')
  END
)), '{}');
--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `github`;
--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `wikipedia`;
--> statement-breakpoint
ALTER TABLE `companies` DROP COLUMN `linkedin`;
