CREATE UNIQUE INDEX IF NOT EXISTS "evaluation_versions_unique_name_commit_id_document_uuid_deleted_at" ON "latitude"."evaluation_versions" USING btree ("name","commit_id","document_uuid","deleted_at");