CREATE TABLE "latitude"."promocodes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"quota_type" varchar(32) NOT NULL,
	"description" text,
	"amount" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promocodes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "latitude"."claimed_promocodes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" bigint NOT NULL,
	"code" varchar(32),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."claimed_promocodes" ADD CONSTRAINT "claimed_promocodes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "latitude"."claimed_promocodes" ADD CONSTRAINT "claimed_promocodes_code_promocodes_code_fk" FOREIGN KEY ("code") REFERENCES "latitude"."promocodes"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "claimed_promocodes_workspace_id_idx" ON "latitude"."claimed_promocodes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "claimed_promocodes_code_idx" ON "latitude"."claimed_promocodes" USING btree ("code");