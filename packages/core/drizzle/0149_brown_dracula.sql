ALTER TABLE "latitude"."document_suggestions" ALTER COLUMN "evaluation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."document_suggestions" ADD COLUMN "evaluation_uuid" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."document_suggestions" ADD CONSTRAINT "document_suggestions_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
