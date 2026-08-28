ALTER TABLE `oauth_tokens` ADD `family_id` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `oauth_tokens` SET `family_id` = `token_hash` WHERE `family_id` = '';
--> statement-breakpoint
ALTER TABLE `oauth_tokens` ADD `revoked_at` integer;
--> statement-breakpoint
CREATE INDEX `oauth_tokens_family_idx` ON `oauth_tokens` (`family_id`);
--> statement-breakpoint
CREATE TABLE `oauth_consent_requests` (
	`nonce_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`params` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
