COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "evaluation_results_v2_workspace_trace_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("workspace_id","evaluated_trace_id");--> statement-breakpoint
