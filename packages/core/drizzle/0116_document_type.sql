DO $$ BEGIN
 CREATE TYPE "latitude"."document_type_enum" AS ENUM('prompt', 'agent');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "latitude"."document_versions" ADD COLUMN "document_type" "latitude"."document_type_enum" DEFAULT 'prompt' NOT NULL;