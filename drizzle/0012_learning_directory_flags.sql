-- Add technl and genesis flags to learning table (same as companies)
ALTER TABLE learning ADD COLUMN technl INTEGER DEFAULT 0;
ALTER TABLE learning ADD COLUMN genesis INTEGER DEFAULT 0;
