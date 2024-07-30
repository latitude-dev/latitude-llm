ALTER TABLE "latitude"."commits" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."commits" ADD CONSTRAINT "commits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
