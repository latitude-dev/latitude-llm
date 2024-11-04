ALTER TABLE "latitude"."evaluation_results" ADD COLUMN "evaluated_provider_log_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results" ADD COLUMN "evaluation_provider_log_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results" ADD CONSTRAINT "evaluation_results_evaluated_provider_log_id_provider_logs_id_fk" FOREIGN KEY ("evaluated_provider_log_id") REFERENCES "latitude"."provider_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results" ADD CONSTRAINT "evaluation_results_evaluation_provider_log_id_provider_logs_id_fk" FOREIGN KEY ("evaluation_provider_log_id") REFERENCES "latitude"."provider_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_provider_log_idx" ON "latitude"."evaluation_results" USING btree ("evaluation_provider_log_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluated_provider_log_idx" ON "latitude"."evaluation_results" USING btree ("evaluated_provider_log_id");