CREATE TABLE "latitude"."organization_claims" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"email" text,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."organization_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "latitude"."organizations" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "organizations_expires_at_idx" ON "latitude"."organizations" ("expires_at") WHERE "expires_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_claims_token_hash_idx" ON "latitude"."organization_claims" ("token_hash");--> statement-breakpoint
CREATE INDEX "organization_claims_organization_id_idx" ON "latitude"."organization_claims" ("organization_id");--> statement-breakpoint
CREATE POLICY "organization_claims_organization_policy" ON "latitude"."organization_claims" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());