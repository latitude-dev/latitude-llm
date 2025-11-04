ALTER TABLE "latitude"."issue_histograms" ADD COLUMN "project_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."issue_histograms" ADD COLUMN "document_uuid" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."issue_histograms" ADD CONSTRAINT "issue_histograms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_histograms_project_id_idx" ON "latitude"."issue_histograms" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "issue_histograms_document_uuid_idx" ON "latitude"."issue_histograms" USING btree ("document_uuid");