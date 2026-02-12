-- Synchronize datasets_v2 unique constraint between main app and enterprise version
-- This migration is idempotent and handles both schemas (latitude and public/default)

-- Drop old index that only had (workspace_id, name) without deleted_at
DROP INDEX IF EXISTS "latitude"."datasets_v2_workspace_id_name_index";
DROP INDEX IF EXISTS "public"."datasets_v2_workspace_id_name_index";
DROP INDEX IF EXISTS "datasets_v2_workspace_id_name_index";

-- Drop intermediate index from migration 0166 (had deleted_at but wasn't a constraint)
DROP INDEX IF EXISTS "latitude"."datasets_v2_workspace_id_name_deleted_at_index";
DROP INDEX IF EXISTS "public"."datasets_v2_workspace_id_name_deleted_at_index";
DROP INDEX IF EXISTS "datasets_v2_workspace_id_name_deleted_at_index";

-- Drop and recreate the correct constraint to ensure it exists with NULLS NOT DISTINCT
ALTER TABLE "latitude"."datasets_v2" DROP CONSTRAINT IF EXISTS "datasets_v2_workspace_id_name_deleted_at_unique";
ALTER TABLE "latitude"."datasets_v2" ADD CONSTRAINT "datasets_v2_workspace_id_name_deleted_at_unique" UNIQUE NULLS NOT DISTINCT("workspace_id", "name", "deleted_at");
