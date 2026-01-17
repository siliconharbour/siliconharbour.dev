-- Add parent_id column to comments table for threading support

ALTER TABLE comments ADD COLUMN parent_id INTEGER;
--> statement-breakpoint

CREATE INDEX comments_parent_idx ON comments(parent_id);
