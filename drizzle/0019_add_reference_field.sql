-- Add field column to references table to track which field the reference came from
-- e.g., "description" for markdown content, "organizer" for event organizers
ALTER TABLE `references` ADD `field` text DEFAULT 'description';
