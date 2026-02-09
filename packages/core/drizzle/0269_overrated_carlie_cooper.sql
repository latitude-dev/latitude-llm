-- Partition evaluation_results_v2 by created_at (weekly partitions)
--
-- This migration:
-- 1. Creates a new partitioned table with the same schema
-- 2. Creates weekly partitions covering last 90 days + 4 weeks ahead + DEFAULT
-- 3. Copies recent data (last 90 days)
-- 4. Swaps tables atomically
-- 5. Keeps old table as evaluation_results_v2_old for safety
--
-- IMPORTANT: Run during low-traffic period. The INSERT...SELECT may take minutes.
-- The final lock + swap blocks writes for a few seconds.
--
-- After validation, drop the old table manually:
--   DROP TABLE IF EXISTS "latitude"."evaluation_results_v2_old";

-- Step 1: Create the partitioned table
CREATE TABLE "latitude"."evaluation_results_v2_partitioned" (
  "id" bigserial NOT NULL,
  "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" bigint NOT NULL,
  "commit_id" bigint NOT NULL,
  "evaluation_uuid" uuid NOT NULL,
  "type" varchar(32),
  "metric" varchar(64),
  "experiment_id" bigint,
  "dataset_id" bigint,
  "evaluated_row_id" bigint,
  "evaluated_log_id" bigint,
  "evaluated_span_id" varchar(16),
  "evaluated_trace_id" varchar(32),
  "score" bigint,
  "normalized_score" bigint,
  "metadata" jsonb,
  "has_passed" boolean,
  "error" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint

-- Step 2: Drop FK constraints from old table so names are available
ALTER TABLE "latitude"."evaluation_results_v2" DROP CONSTRAINT IF EXISTS "evaluation_results_v2_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP CONSTRAINT IF EXISTS "evaluation_results_v2_commit_id_commits_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP CONSTRAINT IF EXISTS "evaluation_results_v2_experiment_id_experiments_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP CONSTRAINT IF EXISTS "evaluation_results_v2_dataset_id_datasets_v2_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP CONSTRAINT IF EXISTS "evaluation_results_v2_evaluated_row_id_dataset_rows_id_fk";
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP CONSTRAINT IF EXISTS "evaluation_results_v2_evaluated_log_id_provider_logs_id_fk";
--> statement-breakpoint

-- Add FK constraints on the partitioned table
ALTER TABLE "latitude"."evaluation_results_v2_partitioned"
  ADD CONSTRAINT "evaluation_results_v2_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2_partitioned"
  ADD CONSTRAINT "evaluation_results_v2_commit_id_commits_id_fk"
  FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2_partitioned"
  ADD CONSTRAINT "evaluation_results_v2_experiment_id_experiments_id_fk"
  FOREIGN KEY ("experiment_id") REFERENCES "latitude"."experiments"("id")
  ON DELETE restrict ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2_partitioned"
  ADD CONSTRAINT "evaluation_results_v2_dataset_id_datasets_v2_id_fk"
  FOREIGN KEY ("dataset_id") REFERENCES "latitude"."datasets_v2"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2_partitioned"
  ADD CONSTRAINT "evaluation_results_v2_evaluated_row_id_dataset_rows_id_fk"
  FOREIGN KEY ("evaluated_row_id") REFERENCES "latitude"."dataset_rows"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2_partitioned"
  ADD CONSTRAINT "evaluation_results_v2_evaluated_log_id_provider_logs_id_fk"
  FOREIGN KEY ("evaluated_log_id") REFERENCES "latitude"."provider_logs"("id")
  ON DELETE cascade ON UPDATE no action;
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
    partition_name := 'evaluation_results_v2_p' || to_char(partition_start, 'YYYYMMDD');

    EXECUTE format(
      'CREATE TABLE "latitude".%I PARTITION OF "latitude"."evaluation_results_v2_partitioned"
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, partition_start, partition_end
    );

    partition_start := partition_end;
  END LOOP;
END $$;
--> statement-breakpoint

-- DEFAULT partition catches anything outside defined ranges
CREATE TABLE "latitude"."evaluation_results_v2_default"
  PARTITION OF "latitude"."evaluation_results_v2_partitioned" DEFAULT;
--> statement-breakpoint

-- Step 4: Drop old indexes so names are available, then create on partitioned table
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_workspace_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_commit_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_evaluation_uuid_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_experiment_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_dataset_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_evaluated_row_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_evaluated_log_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_created_at_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_evaluated_span_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_commit_evaluation_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_type_workspace_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_created_at_brin_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "latitude"."evaluation_results_v2_hitl_lookup_idx";
--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" DROP CONSTRAINT IF EXISTS "evaluation_results_v2_uuid_unique";
--> statement-breakpoint

CREATE INDEX "evaluation_results_v2_workspace_id_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("workspace_id");
--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_commit_id_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("commit_id");
--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_evaluation_uuid_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("evaluation_uuid");
--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_experiment_id_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("experiment_id");
--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_dataset_id_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("dataset_id");
--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_evaluated_row_id_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("evaluated_row_id");
--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_evaluated_log_id_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("evaluated_log_id");
--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_created_at_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("created_at");
--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_evaluated_span_id_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("evaluated_span_id", "evaluated_trace_id");
--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_uuid_idx"
  ON "latitude"."evaluation_results_v2_partitioned" ("uuid");
--> statement-breakpoint

-- Step 5: Copy recent data in weekly batches (last 13 weeks)
DO $$
DECLARE
  batch_start date;
  batch_end date;
  week_cursor date;
BEGIN
  week_cursor := date_trunc('week', now() - interval '13 weeks')::date;

  WHILE week_cursor < now()::date + 1 LOOP
    batch_start := week_cursor;
    batch_end := week_cursor + 7;

    INSERT INTO "latitude"."evaluation_results_v2_partitioned" (
      "id", "uuid", "workspace_id", "commit_id", "evaluation_uuid",
      "type", "metric", "experiment_id", "dataset_id", "evaluated_row_id",
      "evaluated_log_id", "evaluated_span_id", "evaluated_trace_id",
      "score", "normalized_score", "metadata", "has_passed", "error",
      "created_at", "updated_at"
    )
    SELECT
      "id", "uuid", "workspace_id", "commit_id", "evaluation_uuid",
      "type", "metric", "experiment_id", "dataset_id", "evaluated_row_id",
      "evaluated_log_id", "evaluated_span_id", "evaluated_trace_id",
      "score", "normalized_score", "metadata", "has_passed", "error",
      "created_at", "updated_at"
    FROM "latitude"."evaluation_results_v2"
    WHERE "created_at" >= batch_start
      AND "created_at" < batch_end;

    week_cursor := batch_end;
  END LOOP;
END $$;
--> statement-breakpoint

-- Step 6: Lock, copy any remaining rows written during the copy, reset sequence, and swap
-- This brief exclusive lock ensures no data is lost during the swap.
LOCK TABLE "latitude"."evaluation_results_v2" IN EXCLUSIVE MODE;

-- Copy any rows that were inserted during the bulk copy
INSERT INTO "latitude"."evaluation_results_v2_partitioned" (
  "id", "uuid", "workspace_id", "commit_id", "evaluation_uuid",
  "type", "metric", "experiment_id", "dataset_id", "evaluated_row_id",
  "evaluated_log_id", "evaluated_span_id", "evaluated_trace_id",
  "score", "normalized_score", "metadata", "has_passed", "error",
  "created_at", "updated_at"
)
SELECT
  "id", "uuid", "workspace_id", "commit_id", "evaluation_uuid",
  "type", "metric", "experiment_id", "dataset_id", "evaluated_row_id",
  "evaluated_log_id", "evaluated_span_id", "evaluated_trace_id",
  "score", "normalized_score", "metadata", "has_passed", "error",
  "created_at", "updated_at"
FROM "latitude"."evaluation_results_v2"
WHERE "created_at" >= date_trunc('week', now() - interval '13 weeks')
  AND "id" NOT IN (
    SELECT "id" FROM "latitude"."evaluation_results_v2_partitioned"
  );

-- Reset the sequence to match the max id from the old table
SELECT setval(
  pg_get_serial_sequence('"latitude"."evaluation_results_v2_partitioned"', 'id'),
  COALESCE((SELECT max("id") FROM "latitude"."evaluation_results_v2"), 1)
);

-- Swap tables atomically
ALTER TABLE "latitude"."evaluation_results_v2"
  RENAME TO "evaluation_results_v2_old";
ALTER TABLE "latitude"."evaluation_results_v2_partitioned"
  RENAME TO "evaluation_results_v2";
