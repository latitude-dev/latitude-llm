DROP INDEX IF EXISTS "unique_document_uuid_commit_id";--> statement-breakpoint
DROP INDEX IF EXISTS "unique_path_commit_id_deleted_at";--> statement-breakpoint
DROP INDEX IF EXISTS "commit_id_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_idx" ON "latitude"."commits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merged_at_idx" ON "latitude"."commits" USING btree ("merged_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_id_idx" ON "latitude"."commits" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_unique_document_uuid_commit_id" ON "latitude"."document_versions" USING btree ("document_uuid","commit_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_versions_unique_path_commit_id_deleted_at" ON "latitude"."document_versions" USING btree ("path","commit_id","deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_versions_commit_id_idx" ON "latitude"."document_versions" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_versions_deleted_at_idx" ON "latitude"."document_versions" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_versions_path_idx" ON "latitude"."document_versions" USING btree ("path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_logs_commit_id_idx" ON "latitude"."document_logs" USING btree ("commit_id");