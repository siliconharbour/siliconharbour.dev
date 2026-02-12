UPDATE `technology_evidence`
SET
  `source_type` = CASE
    WHEN `source_type` = 'job_posting' THEN 'job_posting'
    ELSE 'manual'
  END,
  `source_label` = CASE
    WHEN `source_type` = 'job_posting' THEN 'Job Postings'
    ELSE 'Get Coding Reference'
  END,
  `source_url` = CASE
    WHEN `source_type` = 'job_posting' THEN `source_url`
    ELSE 'https://docs.google.com/spreadsheets/d/1zEpwpRtq_T4bfmG51_esZ8QJZhvM13iA0aahAuCZEX8/edit?gid=0#gid=0'
  END;
