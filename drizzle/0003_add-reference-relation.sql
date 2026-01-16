-- Add relation column to references table
-- Stores optional relationship metadata like "CEO", "Founder", "Organizer", etc.
-- Used with syntax: [[{relation} at {target}]]

ALTER TABLE "references" ADD COLUMN relation TEXT;
