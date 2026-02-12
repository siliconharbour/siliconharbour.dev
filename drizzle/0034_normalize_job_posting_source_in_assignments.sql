UPDATE `technology_assignments`
SET `source` = 'Job Postings'
WHERE `source` IS NOT NULL
  AND `source` LIKE '%Job Postings%'
  AND `source` <> 'Job Postings';
