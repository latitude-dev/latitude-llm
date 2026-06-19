ALTER TABLE "latitude"."destination_sources" ADD COLUMN "coverage_start_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."destination_sources" ADD COLUMN "backfill_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "latitude"."destination_sources" ADD COLUMN "backfill_progress_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "latitude"."destination_sync_runs" ADD COLUMN "trigger" varchar(16) DEFAULT 'live' NOT NULL;