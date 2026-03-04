CREATE TABLE "latitude"."auth_intent" (
	"id" varchar(24) PRIMARY KEY,
	"type" varchar(32) NOT NULL,
	"email" text NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"existing_account_at_request" boolean DEFAULT false NOT NULL,
	"created_organization_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
