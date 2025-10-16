ALTER TABLE "latitude"."document_versions" ALTER COLUMN "document_type" SET DEFAULT 'agent';--> statement-breakpoint

UPDATE "latitude"."document_versions" SET "document_type" = 'agent';
