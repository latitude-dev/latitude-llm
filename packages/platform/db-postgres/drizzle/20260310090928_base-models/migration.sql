CREATE TABLE "latitude"."account" (
	"id" varchar(24) PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."invitation" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"email" text NOT NULL,
	"role" varchar(50),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" varchar(24) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."invitation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."member" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"user_id" varchar(24) NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."organization" (
	"id" varchar(24) PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"logo" text,
	"metadata" text,
	"creator_id" varchar(24),
	"current_subscription_id" varchar(24),
	"stripe_customer_id" varchar(256),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."session" (
	"id" varchar(24) PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"ip_address" text,
	"user_agent" text,
	"user_id" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."user" (
	"id" varchar(24) PRIMARY KEY,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"role" varchar(50) DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."verification" (
	"id" varchar(24) PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."auth_intent" (
	"id" varchar(24) PRIMARY KEY,
	"type" varchar(32) NOT NULL,
	"email" text NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"existing_account_at_request" boolean DEFAULT false NOT NULL,
	"created_organization_id" varchar(24),
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."subscription" (
	"id" varchar(24) PRIMARY KEY,
	"plan" text NOT NULL,
	"reference_id" varchar(24) NOT NULL,
	"stripe_customer_id" varchar(256),
	"stripe_subscription_id" varchar(256),
	"status" text NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"cancel_at_period_end" boolean,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"seats" integer,
	"trial_start" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"billing_interval" text,
	"stripe_schedule_id" varchar(256)
);
--> statement-breakpoint
ALTER TABLE "latitude"."subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."projects" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"name" varchar(256) NOT NULL,
	"slug" varchar(256) NOT NULL,
	"deleted_at" timestamp with time zone,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."api_keys" (
	"id" varchar(24) PRIMARY KEY,
	"token" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"organization_id" varchar(24) NOT NULL,
	"name" varchar(256),
	"last_used_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."grants" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"subscription_id" varchar(24) NOT NULL,
	"source" varchar(50) NOT NULL,
	"type" varchar(50) NOT NULL,
	"amount" bigint,
	"balance" bigint NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."outbox_events" (
	"id" varchar(24) PRIMARY KEY,
	"event_name" text NOT NULL,
	"aggregate_id" varchar(24) NOT NULL,
	"workspace_id" varchar(24) NOT NULL,
	"payload" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "latitude"."organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "latitude"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."member" ADD CONSTRAINT "member_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "latitude"."organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."member" ADD CONSTRAINT "member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."organization" ADD CONSTRAINT "organization_creator_id_user_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "latitude"."user"("id");--> statement-breakpoint
ALTER TABLE "latitude"."session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "latitude"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "invitation_organization_policy" ON "latitude"."invitation" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "member_organization_policy" ON "latitude"."member" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "subscription_organization_policy" ON "latitude"."subscription" AS PERMISSIVE FOR ALL TO public USING (reference_id = get_current_organization_id()) WITH CHECK (reference_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "projects_organization_policy" ON "latitude"."projects" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "api_keys_organization_policy" ON "latitude"."api_keys" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "grants_organization_policy" ON "latitude"."grants" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());