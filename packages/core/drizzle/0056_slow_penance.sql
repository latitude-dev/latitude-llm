ALTER TABLE "latitude"."commits" DROP CONSTRAINT "unique_commit_version";--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" DROP CONSTRAINT "unique_document_uuid_commit_id";--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" DROP CONSTRAINT "unique_path_commit_id_deleted_at";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_commit_version" ON "latitude"."commits" USING btree ("version","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_document_uuid_commit_id" ON "latitude"."document_versions" USING btree ("document_uuid","commit_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_path_commit_id_deleted_at" ON "latitude"."document_versions" USING btree ("path","commit_id","deleted_at");