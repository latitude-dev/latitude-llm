ALTER TABLE "latitude"."document_versions" ADD COLUMN "dataset_v2_id" bigint;--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" ADD COLUMN "linked_dataset_by_dataset_id_and_row_id" json DEFAULT '{}'::json;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_versions" ADD CONSTRAINT "document_versions_dataset_v2_id_datasets_v2_id_fk" FOREIGN KEY ("dataset_v2_id") REFERENCES "latitude"."datasets_v2"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
