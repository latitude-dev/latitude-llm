COMMIT;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "document_logs_source_created_at_idx" ON "latitude"."document_logs" USING btree ("source","created_at");--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "document_logs_created_at_brin_idx" ON "latitude"."document_logs" USING brin ("created_at") WITH (pages_per_range=32,autosummarize=true);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "provider_logs_created_at_brin_idx" ON "latitude"."provider_logs" USING brin ("created_at") WITH (pages_per_range=32,autosummarize=true);--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "evaluation_results_v2_created_at_brin_idx" ON "latitude"."evaluation_results_v2" USING brin ("created_at") WITH (pages_per_range=32,autosummarize=true);