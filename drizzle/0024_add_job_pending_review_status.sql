-- Add pending_review status to jobs
-- SQLite doesn't enforce enum constraints, so this is documentation only
-- New imported jobs will be inserted with status='pending_review' instead of 'active'
-- No actual schema change needed - status column already exists as text
SELECT 1;
