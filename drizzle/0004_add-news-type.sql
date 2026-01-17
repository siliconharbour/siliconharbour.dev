-- Add type column to news table
-- Types: announcement (default), editorial, meta

ALTER TABLE news ADD COLUMN type TEXT NOT NULL DEFAULT 'announcement';
