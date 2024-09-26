DO $$ BEGIN
 CREATE TYPE "latitude"."reward_types" AS ENUM('github_star', 'follow', 'post', 'github_issue', 'referral');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."claimed_rewards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"creator_id" text,
	"reward_type" "latitude"."reward_types" NOT NULL,
	"reference" text NOT NULL,
	"value" bigint NOT NULL,
	"is_valid" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."claimed_rewards" ADD CONSTRAINT "claimed_rewards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."claimed_rewards" ADD CONSTRAINT "claimed_rewards_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "latitude"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claimed_rewards_workspace_id_idx" ON "latitude"."claimed_rewards" USING btree ("workspace_id");