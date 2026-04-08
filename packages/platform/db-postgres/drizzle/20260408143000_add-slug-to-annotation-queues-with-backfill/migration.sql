-- Custom SQL migration file, put your code below! --
-- Step 1: Add slug column as nullable
ALTER TABLE "latitude"."annotation_queues" ADD COLUMN IF NOT EXISTS "slug" varchar(140);--> statement-breakpoint

-- Step 2: Backfill slug from name (URL-safe: lowercase, replace non-alphanumeric with hyphens)
-- Handle duplicates by appending a portion of the id
UPDATE "latitude"."annotation_queues"
SET "slug" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "latitude"."annotation_queues" AS other
    WHERE other.organization_id = annotation_queues.organization_id
      AND other.project_id = annotation_queues.project_id
      AND other.id != annotation_queues.id
      AND lower(regexp_replace(other.name, '[^a-zA-Z0-9]+', '-', 'g')) = lower(regexp_replace(annotation_queues.name, '[^a-zA-Z0-9]+', '-', 'g'))
  ) THEN
    -- Append first 6 chars of id to disambiguate
    lower(substring(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), 1, 130)) || '-' || left(id::text, 6)
  ELSE
    lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
END
WHERE "slug" IS NULL;--> statement-breakpoint

-- Step 3: Make slug non-nullable
ALTER TABLE "latitude"."annotation_queues" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint

-- Step 4: Add unique constraint for slug per project
ALTER TABLE "latitude"."annotation_queues"
ADD CONSTRAINT "annotation_queues_unique_slug_per_project_idx"
UNIQUE("organization_id","project_id","slug");--> statement-breakpoint

-- Step 5: Create index for system queue lookups by slug
CREATE INDEX IF NOT EXISTS "annotation_queues_project_system_slug_idx" 
ON "latitude"."annotation_queues" ("organization_id","project_id","system","slug");--> statement-breakpoint
