ALTER TABLE "latitude"."spans" ADD COLUMN "custom_identifier" text;--> statement-breakpoint
COMMIT;--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_workspace_custom_identifier_idx" ON "latitude"."spans" USING btree ("workspace_id","custom_identifier");
