CREATE INDEX IF NOT EXISTS "projects_deleted_at_idx" ON "latitude"."projects" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commits_deleted_at_indx" ON "latitude"."commits" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_logs_created_at_idx" ON "latitude"."document_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_logs_created_at_idx" ON "latitude"."provider_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluations_deleted_at_idx" ON "latitude"."evaluations" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_created_at_idx" ON "latitude"."evaluation_results" USING btree ("created_at");