-- Add occurred_at column to issue_histograms table and backfill it with date values. With timezone support.
ALTER TABLE "latitude"."issue_histograms" ADD COLUMN "occurred_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- Backfill occurred_at column with date values (casting date to text first, then appending time)
UPDATE "latitude"."issue_histograms" SET "occurred_at" = (CAST("date" AS text) || ' 00:00:00')::timestamp with time zone;--> statement-breakpoint

-- Create BRIN index on occurred_at column
CREATE INDEX "issue_histograms_occurred_at_brin_idx" ON "latitude"."issue_histograms" USING brin ("occurred_at") WITH (pages_per_range=32,autosummarize=true);--> statement-breakpoint

