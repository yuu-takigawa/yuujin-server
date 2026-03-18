-- Add status column to news table for quality gate
-- Articles start as 'draft', promoted to 'published' after AI annotation succeeds
ALTER TABLE news ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft' AFTER annotations;
ALTER TABLE news ADD INDEX idx_status (status);

-- Mark existing annotated articles as published
UPDATE news SET status = 'published'
WHERE JSON_LENGTH(JSON_EXTRACT(annotations, '$.paragraphs')) > 0;
