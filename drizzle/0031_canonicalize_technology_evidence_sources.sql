UPDATE `technology_evidence`
SET
  `source_type` = CASE
    WHEN `source_type` = 'job_posting' THEN 'job_posting'
    ELSE 'manual'
  END,
  `source_label` = CASE
    WHEN `source_type` = 'job_posting' THEN 'Job Postings'
    ELSE 'Coding Reference'
  END;
