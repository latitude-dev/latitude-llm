-- Partition spans by started_at (weekly partitions)
--
-- This migration:
-- 1. Creates a new partitioned table with the same schema (PK only, no indexes)
-- 2. Creates weekly partitions covering last 90 days + 4 weeks ahead + DEFAULT
-- 3. Copies recent data in daily batches (~1.5M rows/day)
-- 4. Locks, catches up missed rows, swaps tables atomically
-- 5. Keeps old table as spans_old for safety
--
-- Old indexes are kept alive during the copy so the catch-up query can use them.
-- They are dropped in migration 0270, which also creates the new indexes CONCURRENTLY.
--
-- IMPORTANT: Run during low-traffic period. The data copy may take 10-20 min.
-- The final lock + swap blocks writes for ~15-30 seconds.
--
-- After validation, drop the old table manually:
--   DROP TABLE IF EXISTS "latitude"."spans_old";

-- Step 1: Create the partitioned table
CREATE TABLE "latitude"."spans_partitioned" (
  "id" varchar(16) NOT NULL,
  "trace_id" varchar(32) NOT NULL,
  "document_log_uuid" uuid,
  "parent_id" varchar(16),
  "previous_trace_id" varchar(32),
  "workspace_id" bigint NOT NULL,
  "api_key_id" bigint NOT NULL,
  "name" varchar(128) NOT NULL,
  "kind" varchar(32) NOT NULL,
  "type" varchar(32) NOT NULL,
  "status" varchar(32) NOT NULL,
  "message" varchar,
  "duration" bigint NOT NULL,
  "started_at" timestamp NOT NULL,
  "ended_at" timestamp NOT NULL,
  "document_uuid" uuid,
  "commit_uuid" uuid,
  "experiment_uuid" uuid,
  "project_id" bigint,
  "source" varchar(32),
  "test_deployment_id" bigint,
  "tokens_prompt" integer,
  "tokens_cached" integer,
  "tokens_reasoning" integer,
  "tokens_completion" integer,
  "model" varchar,
  "cost" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("trace_id", "id", "started_at")
) PARTITION BY RANGE ("started_at");
--> statement-breakpoint

-- Step 2: Drop FK constraints from old table (not recreated on partitioned table)
ALTER TABLE "latitude"."spans" DROP CONSTRAINT IF EXISTS "spans_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."spans" DROP CONSTRAINT IF EXISTS "spans_api_key_id_api_keys_id_fk";
--> statement-breakpoint

-- Step 3: Create weekly partitions
-- Past 13 weeks (~90 days) + 4 future weeks + DEFAULT
DO $$
DECLARE
  start_date date;
  end_date date;
  partition_start date;
  partition_end date;
  partition_name text;
BEGIN
  -- Start from 13 weeks ago (Monday-aligned)
  start_date := date_trunc('week', now() - interval '13 weeks')::date;
  -- End 4 weeks from now
  end_date := date_trunc('week', now() + interval '4 weeks')::date + 7;

  partition_start := start_date;
  WHILE partition_start < end_date LOOP
    partition_end := partition_start + 7;
    partition_name := 'spans_p' || to_char(partition_start, 'YYYYMMDD');

    EXECUTE format(
      'CREATE TABLE "latitude".%I PARTITION OF "latitude"."spans_partitioned"
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, partition_start, partition_end
    );

    partition_start := partition_end;
  END LOOP;
END $$;
--> statement-breakpoint

-- DEFAULT partition catches anything outside defined ranges
CREATE TABLE "latitude"."spans_default"
  PARTITION OF "latitude"."spans_partitioned" DEFAULT;
--> statement-breakpoint

-- Step 4: Copy recent data in daily batches (last 90 days)
-- ~1.5M spans/day so daily batches keep each INSERT manageable.
DO $$
DECLARE
  batch_start date;
  batch_end date;
  day_cursor date;
BEGIN
  day_cursor := date_trunc('week', now() - interval '13 weeks')::date;

  WHILE day_cursor < now()::date + 1 LOOP
    batch_start := day_cursor;
    batch_end := day_cursor + 1;

    INSERT INTO "latitude"."spans_partitioned" (
      "id", "trace_id", "document_log_uuid", "parent_id", "previous_trace_id",
      "workspace_id", "api_key_id", "name", "kind", "type", "status",
      "message", "duration", "started_at", "ended_at",
      "document_uuid", "commit_uuid", "experiment_uuid", "project_id",
      "source", "test_deployment_id",
      "tokens_prompt", "tokens_cached", "tokens_reasoning", "tokens_completion",
      "model", "cost",
      "created_at", "updated_at"
    )
    SELECT
      "id", "trace_id", "document_log_uuid", "parent_id", "previous_trace_id",
      "workspace_id", "api_key_id", "name", "kind", "type", "status",
      "message", "duration", "started_at", "ended_at",
      "document_uuid", "commit_uuid", "experiment_uuid", "project_id",
      "source", "test_deployment_id",
      "tokens_prompt", "tokens_cached", "tokens_reasoning", "tokens_completion",
      "model", "cost",
      "created_at", "updated_at"
    FROM "latitude"."spans"
    WHERE "started_at" >= batch_start
      AND "started_at" < batch_end;

    day_cursor := batch_end;
  END LOOP;
END $$;
--> statement-breakpoint

-- Step 5: Lock, copy any remaining rows written during the copy, and swap
-- Uses a 1-day window so the old table's started_at index keeps this fast (~15-30s).
LOCK TABLE "latitude"."spans" IN EXCLUSIVE MODE;
--> statement-breakpoint

-- Copy any rows that were inserted during the bulk copy
INSERT INTO "latitude"."spans_partitioned" (
  "id", "trace_id", "document_log_uuid", "parent_id", "previous_trace_id",
  "workspace_id", "api_key_id", "name", "kind", "type", "status",
  "message", "duration", "started_at", "ended_at",
  "document_uuid", "commit_uuid", "experiment_uuid", "project_id",
  "source", "test_deployment_id",
  "tokens_prompt", "tokens_cached", "tokens_reasoning", "tokens_completion",
  "model", "cost",
  "created_at", "updated_at"
)
SELECT
  s."id", s."trace_id", s."document_log_uuid", s."parent_id", s."previous_trace_id",
  s."workspace_id", s."api_key_id", s."name", s."kind", s."type", s."status",
  s."message", s."duration", s."started_at", s."ended_at",
  s."document_uuid", s."commit_uuid", s."experiment_uuid", s."project_id",
  s."source", s."test_deployment_id",
  s."tokens_prompt", s."tokens_cached", s."tokens_reasoning", s."tokens_completion",
  s."model", s."cost",
  s."created_at", s."updated_at"
FROM "latitude"."spans" s
WHERE s."started_at" >= now() - interval '1 day'
  AND NOT EXISTS (
    SELECT 1 FROM "latitude"."spans_partitioned" p
    WHERE p."trace_id" = s."trace_id"
      AND p."id" = s."id"
      AND p."started_at" = s."started_at"
  );
--> statement-breakpoint

-- Swap tables atomically
ALTER TABLE "latitude"."spans"
  RENAME TO "spans_old";
--> statement-breakpoint
ALTER TABLE "latitude"."spans_partitioned"
  RENAME TO "spans";
