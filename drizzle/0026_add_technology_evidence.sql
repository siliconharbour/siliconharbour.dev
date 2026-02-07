CREATE TABLE `technology_evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`technology_assignment_id` integer NOT NULL,
	`job_id` integer,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`source_label` text,
	`source_url` text,
	`excerpt_text` text,
	`last_verified` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`technology_assignment_id`) REFERENCES `technology_assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tech_evidence_assignment_idx` ON `technology_evidence` (`technology_assignment_id`);
--> statement-breakpoint
CREATE INDEX `tech_evidence_job_idx` ON `technology_evidence` (`job_id`);
--> statement-breakpoint
INSERT INTO `technology_evidence` (
  `technology_assignment_id`,
  `source_type`,
  `source_label`,
  `source_url`,
  `last_verified`,
  `created_at`
)
SELECT
  `id`,
  CASE
    WHEN `source` LIKE '%Job Postings%' THEN 'job_posting'
    WHEN `source` LIKE '%Survey%' OR `source` LIKE '%Get Building%' OR `source` LIKE '%Get Coding%' THEN 'survey'
    ELSE 'manual'
  END,
  `source`,
  `source_url`,
  `last_verified`,
  `created_at`
FROM `technology_assignments`
WHERE (`source` IS NOT NULL AND `source` != '')
   OR (`source_url` IS NOT NULL AND `source_url` != '');
