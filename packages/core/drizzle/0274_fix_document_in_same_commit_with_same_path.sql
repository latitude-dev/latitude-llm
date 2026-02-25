-- Fix duplicate documents by renaming them
-- For each set of duplicates (same path, commit_id, deleted_at IS NULL),
-- keep the first one (by id) with original path, rename others with _1, _2, etc.
WITH duplicates AS (
  SELECT
    id,
    path,
    commit_id,
    ROW_NUMBER() OVER (PARTITION BY path, commit_id ORDER BY id) as rn
  FROM latitude.document_versions
  WHERE deleted_at IS NULL
),
to_rename AS (
  SELECT id, path, rn
  FROM duplicates
  WHERE rn > 1
)
UPDATE latitude.document_versions dv
SET path = tr.path || '_' || (tr.rn - 1)::text
FROM to_rename tr
WHERE dv.id = tr.id;--> statement-breakpoint
