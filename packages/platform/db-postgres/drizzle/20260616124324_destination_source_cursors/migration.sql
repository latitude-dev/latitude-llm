CREATE TABLE "latitude"."destination_source_cursors" (
	"organization_id" varchar(24) NOT NULL,
	"destination_id" varchar(24),
	"source" varchar(32),
	"watermark" timestamp with time zone NOT NULL,
	"watermark_id" varchar(32) DEFAULT '' NOT NULL,
	"last_run_at" timestamp with time zone,
	"consecutive_empty_runs" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destination_source_cursors_pkey" PRIMARY KEY("destination_id","source")
);
--> statement-breakpoint
ALTER TABLE "latitude"."destination_source_cursors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "latitude"."destinations_status_last_run_at_idx";--> statement-breakpoint
ALTER TABLE "latitude"."destination_sync_runs" ADD COLUMN "source" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."destinations" DROP COLUMN "cursor_ingested_at";--> statement-breakpoint
ALTER TABLE "latitude"."destinations" DROP COLUMN "cursor_span_id";--> statement-breakpoint
ALTER TABLE "latitude"."destinations" DROP COLUMN "last_run_at";--> statement-breakpoint
ALTER TABLE "latitude"."destinations" DROP COLUMN "consecutive_empty_runs";--> statement-breakpoint
CREATE INDEX "destination_source_cursors_last_run_at_idx" ON "latitude"."destination_source_cursors" ("last_run_at");--> statement-breakpoint
CREATE POLICY "destination_source_cursors_organization_policy" ON "latitude"."destination_source_cursors" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());