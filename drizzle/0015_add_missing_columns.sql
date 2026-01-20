-- Add missing columns to companies, groups, education, and people tables

-- Companies: add github and visible columns
ALTER TABLE companies ADD COLUMN github TEXT;
--> statement-breakpoint
ALTER TABLE companies ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint

-- Groups: add visible column
ALTER TABLE groups ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint

-- Education: add visible column
ALTER TABLE education ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint

-- People: add visible column
ALTER TABLE people ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
