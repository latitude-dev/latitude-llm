ALTER TABLE "latitude"."destination_source_cursors" RENAME TO "destination_sources";--> statement-breakpoint
ALTER INDEX "latitude"."destination_source_cursors_last_run_at_idx" RENAME TO "destination_sources_last_run_at_idx";--> statement-breakpoint
ALTER TABLE "latitude"."destination_sources" ADD COLUMN "status" varchar(16) DEFAULT 'enabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."destination_sources" ADD COLUMN "config" jsonb NOT NULL;--> statement-breakpoint
ALTER POLICY "destination_source_cursors_organization_policy" ON "latitude"."destination_sources" RENAME TO "destination_sources_organization_policy";