-- Create import_jobs table for tracking long-running import operations

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  current_page INTEGER DEFAULT 1,
  total_pages INTEGER DEFAULT 0,
  rate_limit_remaining INTEGER,
  rate_limit_reset INTEGER,
  last_error TEXT,
  last_activity INTEGER,
  imported_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at INTEGER
);
--> statement-breakpoint

-- Create rate_limits table for rate limiting

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint

CREATE INDEX rate_limits_expires_idx ON rate_limits(expires_at);
