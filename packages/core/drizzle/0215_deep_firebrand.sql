COMMIT;
--> statement-breakpoint

BEGIN;
ALTER TABLE "latitude"."spans" ADD COLUMN "document_uuid" uuid;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "commit_uuid" uuid;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "experiment_id" bigint;--> statement-breakpoint
COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY "spans_document_uuid_idx" ON "latitude"."spans" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "spans_commit_uuid_idx" ON "latitude"."spans" USING btree ("commit_uuid");--> statement-breakpoint
CREATE INDEX CONCURRENTLY "spans_experiment_id_idx" ON "latitude"."spans" USING btree ("experiment_id");
