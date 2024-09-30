/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'latitude'
                AND table_name = 'events'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "events" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "latitude"."events" ADD COLUMN "workspace_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_workspace_idx" ON "latitude"."events" USING btree ("workspace_id");