UPDATE `technology_evidence`
SET `source_label` = 'Job Postings'
WHERE `source_type` = 'job_posting'
  AND (`source_label` IS NULL OR trim(`source_label`) = '' OR `source_label` <> 'Job Postings');
