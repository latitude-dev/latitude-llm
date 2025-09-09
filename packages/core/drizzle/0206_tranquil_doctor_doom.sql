CREATE TABLE "latitude"."grants" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"reference_id" varchar(36) NOT NULL,
	"source" varchar(32) NOT NULL,
	"type" varchar(32) NOT NULL,
	"amount" bigint,
	"balance" bigint NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "grants_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
ALTER TABLE "latitude"."grants" ADD CONSTRAINT "grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grants_workspace_id_idx" ON "latitude"."grants" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "grants_reference_id_idx" ON "latitude"."grants" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "grants_expires_at_idx" ON "latitude"."grants" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "grants_created_at_idx" ON "latitude"."grants" USING btree ("created_at");