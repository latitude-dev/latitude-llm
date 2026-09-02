CREATE TABLE "latitude"."partners" (
	"id" varchar(24) PRIMARY KEY,
	"name" varchar(256) NOT NULL,
	"icon_url" text,
	"redirect_urls" jsonb NOT NULL,
	"hmac_secret" text NOT NULL,
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"allowed_ips" jsonb DEFAULT '[]' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
