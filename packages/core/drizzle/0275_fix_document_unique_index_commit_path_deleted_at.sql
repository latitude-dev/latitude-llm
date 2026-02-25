COMMIT;--> statement-breakpoint

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  "document_versions_unique_path_commit_id_deleted_at__new"
ON "latitude"."document_versions" ("path","commit_id","deleted_at") NULLS NOT DISTINCT;--> statement-breakpoint

BEGIN;--> statement-breakpoint

-- Drop constraint if it exists
ALTER TABLE "latitude"."document_versions"
  DROP CONSTRAINT IF EXISTS "document_versions_unique_path_commit_id_deleted_at";--> statement-breakpoint

COMMIT;--> statement-breakpoint

-- Drop leftover index if it exists (name collision in CI)
DROP INDEX CONCURRENTLY IF EXISTS
  "latitude"."document_versions_unique_path_commit_id_deleted_at";--> statement-breakpoint

BEGIN;--> statement-breakpoint

-- Now it’s safe to add the constraint using the prebuilt index
ALTER TABLE "latitude"."document_versions"
  ADD CONSTRAINT "document_versions_unique_path_commit_id_deleted_at"
  UNIQUE USING INDEX "document_versions_unique_path_commit_id_deleted_at__new";--> statement-breakpoint
