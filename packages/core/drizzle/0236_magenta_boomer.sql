BEGIN;
ALTER TABLE "latitude"."spans" ADD COLUMN "project_id" bigint;--> statement-breakpoint
COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY "spans_project_id_idx" ON "latitude"."spans" USING btree ("project_id");
