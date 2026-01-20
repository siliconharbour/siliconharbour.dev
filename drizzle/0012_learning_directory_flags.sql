-- Add technl and genesis flags to education table (same as companies)
ALTER TABLE education ADD COLUMN technl INTEGER DEFAULT 0;
--> statement-breakpoint
ALTER TABLE education ADD COLUMN genesis INTEGER DEFAULT 0;
