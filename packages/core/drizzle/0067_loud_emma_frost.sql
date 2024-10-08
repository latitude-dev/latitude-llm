DO $$ BEGIN
 CREATE TYPE "latitude"."subscription_plans" AS ENUM('hobby_v1', 'hobby_v2', 'team_v1', 'enterprise_v1');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"plan" "latitude"."subscription_plans" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."workspaces" ADD COLUMN "current_subscription_id" bigint;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_workspace_id_index" ON "latitude"."subscriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_plan_index" ON "latitude"."subscriptions" USING btree ("plan");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."workspaces" ADD CONSTRAINT "workspaces_current_subscription_id_subscriptions_id_fk" FOREIGN KEY ("current_subscription_id") REFERENCES "latitude"."subscriptions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
