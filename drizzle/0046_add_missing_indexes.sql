-- Add missing indexes for commonly queried columns.
-- event_dates.event_id is queried on every event listing/detail page.
-- event_dates.start_date is used for date range queries and ordering.
-- events.import_status is filtered frequently (pending_review, published).

CREATE INDEX `event_dates_event_id_idx` ON `event_dates` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_dates_start_date_idx` ON `event_dates` (`start_date`);--> statement-breakpoint
CREATE INDEX `events_import_status_idx` ON `events` (`import_status`);
