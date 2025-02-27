ALTER TABLE "latitude"."document_suggestions" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."document_suggestions" ALTER COLUMN "old_prompt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."document_suggestions" ALTER COLUMN "new_prompt" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."document_suggestions" DROP COLUMN IF EXISTS "prompt";