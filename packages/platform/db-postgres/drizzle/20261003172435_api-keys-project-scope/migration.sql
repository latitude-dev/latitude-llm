ALTER TABLE "latitude"."api_keys" ADD COLUMN "project_id" varchar(24);--> statement-breakpoint
CREATE INDEX "api_keys_project_id_idx" ON "latitude"."api_keys" ("project_id");--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE RESTRICT;