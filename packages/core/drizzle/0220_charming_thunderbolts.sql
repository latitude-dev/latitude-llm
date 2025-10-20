COMMIT;
--> statement-breakpoint

BEGIN;
DROP INDEX IF EXISTS "latitude"."spans_experiment_id_idx";--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN IF NOT EXISTS "experiment_uuid" uuid;--> statement-breakpoint
ALTER TABLE "latitude"."spans" DROP COLUMN IF EXISTS "experiment_id";--> statement-breakpoint
COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY "spans_experiment_uuid_idx" ON "latitude"."spans" USING btree ("experiment_uuid");--> statement-breakpoint
