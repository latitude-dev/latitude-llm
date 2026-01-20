CREATE TABLE "latitude"."integration_header_presets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"integration_id" bigint NOT NULL,
	"workspace_id" bigint NOT NULL,
	"name" varchar(256) NOT NULL,
	"headers" jsonb NOT NULL,
	"author_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "integration_header_presets_integration_id_name_unique" UNIQUE("integration_id","name")
);
--> statement-breakpoint
ALTER TABLE "latitude"."integration_header_presets" ADD CONSTRAINT "integration_header_presets_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "latitude"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."integration_header_presets" ADD CONSTRAINT "integration_header_presets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."integration_header_presets" ADD CONSTRAINT "integration_header_presets_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "latitude"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_header_presets_integration_id_idx" ON "latitude"."integration_header_presets" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "integration_header_presets_workspace_id_idx" ON "latitude"."integration_header_presets" USING btree ("workspace_id");