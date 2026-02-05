COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_workspace_project_started_at_id_idx" ON "latitude"."spans" USING btree ("workspace_id","project_id","started_at","id");
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS "spans_workspace_document_started_at_id_idx" ON "latitude"."spans" USING btree ("workspace_id","document_uuid","started_at","id");

