ALTER TABLE "latitude"."document_versions" ADD COLUMN "dataset_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_versions" ADD CONSTRAINT "document_versions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "latitude"."datasets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
