-- Custom SQL migration file, put your code below! --
-- Step 1: Backfill from the earliest linked score per issue
UPDATE "latitude"."issues" i
SET "source" = CASE
  WHEN s.source = 'annotation' AND s.source_id = 'SYSTEM' THEN 'flagger'
  ELSE s.source
END
FROM (
  SELECT DISTINCT ON (issue_id) issue_id, source, source_id
  FROM "latitude"."scores"
  WHERE issue_id IS NOT NULL
  ORDER BY issue_id, created_at ASC
) s
WHERE i.id = s.issue_id;--> statement-breakpoint

-- Step 2: Default any remaining orphaned issues (issues with zero linked scores)
UPDATE "latitude"."issues"
SET "source" = 'annotation'
WHERE "source" IS NULL;--> statement-breakpoint

-- Step 3: Make source non-nullable
ALTER TABLE "latitude"."issues" ALTER COLUMN "source" SET NOT NULL;
