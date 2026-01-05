COMMIT;
--> statement-breakpoint

BEGIN;
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "type" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "metric" varchar(64) NOT NULL;--> statement-breakpoint
COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY "evaluation_results_v2_type_workspace_idx" ON "latitude"."evaluation_results_v2" USING btree ("type","workspace_id");