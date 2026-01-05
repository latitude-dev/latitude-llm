ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluation_type" varchar(32);--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluation_metric" varchar(64);--> statement-breakpoint
CREATE INDEX "evaluation_results_v2_type_workspace_idx" ON "latitude"."evaluation_results_v2" USING btree ("evaluation_type","workspace_id");--> statement-breakpoint
UPDATE "latitude"."evaluation_results_v2" r
SET evaluation_type = v.type, evaluation_metric = v.metric
FROM (
  SELECT DISTINCT ON (evaluation_uuid) evaluation_uuid, type, metric
  FROM "latitude"."evaluation_versions"
  ORDER BY evaluation_uuid, id DESC
) v
WHERE r.evaluation_uuid = v.evaluation_uuid
AND r.evaluation_type IS NULL;
