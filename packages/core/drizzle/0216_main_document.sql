ALTER TABLE "latitude"."commits"
ADD COLUMN "main_document_uuid" uuid;

--> statement-breakpoint
CREATE INDEX "commits_main_document_uuid_idx" ON "latitude"."commits" USING btree ("main_document_uuid");