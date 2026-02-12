UPDATE `technology_evidence`
SET `excerpt_text` = NULL
WHERE `source_type` = 'job_posting'
  AND `excerpt_text` IS NOT NULL
  AND (
    length(trim(`excerpt_text`)) > 500
    OR `excerpt_text` LIKE '%<p>%'
    OR `excerpt_text` LIKE '%<div%'
    OR `excerpt_text` LIKE '%<h1%'
    OR `excerpt_text` LIKE '%<h2%'
    OR `excerpt_text` LIKE '%<h3%'
    OR `excerpt_text` LIKE '%<ul%'
    OR `excerpt_text` LIKE '%<li%'
  );
