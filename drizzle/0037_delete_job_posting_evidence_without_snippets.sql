DELETE FROM `technology_evidence`
WHERE `source_type` = 'job_posting'
  AND (`excerpt_text` IS NULL OR trim(`excerpt_text`) = '');
