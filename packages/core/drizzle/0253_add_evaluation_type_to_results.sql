ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluation_type" varchar(32);--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluation_metric" varchar(64);--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_type_workspace_idx" ON "latitude"."evaluation_results_v2" USING btree ("evaluation_type","workspace_id");

