-- Drop old indexes from spans_old and create new indexes on partitioned spans table
--
-- IMPORTANT: This migration MUST run outside a transaction.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Run this manually after migration 0269 completes:
--
--   psql $DATABASE_URL -f packages/core/drizzle/0270_create_spans_indexes_concurrently.sql
--
-- Step 1: Drop old indexes (now on spans_old after the rename in 0269)
-- This frees up index names for reuse on the new partitioned table.

DROP INDEX IF EXISTS "latitude"."spans_id_idx";
DROP INDEX IF EXISTS "latitude"."spans_trace_id_idx";
DROP INDEX IF EXISTS "latitude"."spans_document_log_uuid_idx";
DROP INDEX IF EXISTS "latitude"."spans_parent_id_idx";
DROP INDEX IF EXISTS "latitude"."spans_workspace_id_idx";
DROP INDEX IF EXISTS "latitude"."spans_api_key_id_idx";
DROP INDEX IF EXISTS "latitude"."spans_type_started_at_idx";
DROP INDEX IF EXISTS "latitude"."spans_status_started_at_idx";
DROP INDEX IF EXISTS "latitude"."spans_started_at_idx";
DROP INDEX IF EXISTS "latitude"."spans_started_at_brin_idx";
DROP INDEX IF EXISTS "latitude"."spans_document_uuid_idx";
DROP INDEX IF EXISTS "latitude"."spans_commit_uuid_idx";
DROP INDEX IF EXISTS "latitude"."spans_experiment_uuid_idx";
DROP INDEX IF EXISTS "latitude"."spans_test_deployment_id_idx";
DROP INDEX IF EXISTS "latitude"."spans_workspace_commit_started_at_id_idx";
DROP INDEX IF EXISTS "latitude"."spans_previous_trace_id_idx";
DROP INDEX IF EXISTS "latitude"."spans_workspace_type_source_idx";
DROP INDEX IF EXISTS "latitude"."spans_workspace_started_at_idx";
ALTER TABLE "latitude"."spans_old" DROP CONSTRAINT IF EXISTS "spans_trace_id_id_pk";

-- Step 2: Create reduced index set on new partitioned table CONCURRENTLY
-- Composite indexes removed since partition pruning on started_at handles
-- temporal filtering. Only single-column indexes for frequently queried columns.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_id_idx"
  ON "latitude"."spans" ("id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_trace_id_idx"
  ON "latitude"."spans" ("trace_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_workspace_id_idx"
  ON "latitude"."spans" ("workspace_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_commit_uuid_idx"
  ON "latitude"."spans" ("commit_uuid");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_type_idx"
  ON "latitude"."spans" ("type");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_document_uuid_idx"
  ON "latitude"."spans" ("document_uuid");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_document_log_uuid_idx"
  ON "latitude"."spans" ("document_log_uuid");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_experiment_uuid_idx"
  ON "latitude"."spans" ("experiment_uuid");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_parent_id_idx"
  ON "latitude"."spans" ("parent_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_source_idx"
  ON "latitude"."spans" ("source");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_started_at_brin_idx"
  ON "latitude"."spans" USING brin ("started_at");
