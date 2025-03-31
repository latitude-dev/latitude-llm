ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "dataset_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."evaluation_results_v2" ADD COLUMN "evaluated_row_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results_v2" ADD CONSTRAINT "evaluation_results_v2_dataset_id_datasets_v2_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "latitude"."datasets_v2"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluation_results_v2" ADD CONSTRAINT "evaluation_results_v2_evaluated_row_id_dataset_rows_id_fk" FOREIGN KEY ("evaluated_row_id") REFERENCES "latitude"."dataset_rows"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_v2_dataset_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluation_results_v2_evaluated_row_id_idx" ON "latitude"."evaluation_results_v2" USING btree ("evaluated_row_id");