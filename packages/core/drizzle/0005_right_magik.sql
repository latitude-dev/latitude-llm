DROP TABLE "latitude"."document_hierarchies";--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" DROP CONSTRAINT "document_versions_parent_id_document_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" ALTER COLUMN "content" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" ALTER COLUMN "content" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" ADD COLUMN "path" varchar NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_uuid_commit_id_idx" ON "latitude"."document_versions" USING btree ("document_uuid","commit_id");--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" DROP COLUMN IF EXISTS "name";--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" DROP COLUMN IF EXISTS "document_type";--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" DROP COLUMN IF EXISTS "parent_id";--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" ADD CONSTRAINT "unique_document_uuid_commit_id" UNIQUE("document_uuid","commit_id");--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" ADD CONSTRAINT "unique_path_commit_id" UNIQUE("path","commit_id");

-- Drop triggers
DROP TRIGGER IF EXISTS after_document_versions_insert ON "latitude"."document_versions";
DROP TRIGGER IF EXISTS after_document_versions_delete ON "latitude"."document_versions";
DROP TRIGGER IF EXISTS after_document_versions_update ON "latitude"."document_versions";

-- Drop functions
DROP FUNCTION IF EXISTS document_versions_insert_trigger();
DROP FUNCTION IF EXISTS document_versions_delete_trigger();
DROP FUNCTION IF EXISTS document_versions_update_trigger();
