CREATE TABLE "latitude"."annotation_queue_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"annotation_queue_id" bigint NOT NULL,
	"workspace_id" bigint NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"completed_by_membership_id" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."annotation_queue_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"annotation_queue_id" bigint NOT NULL,
	"membership_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latitude"."annotation_queues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "annotation_queues_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
DROP TABLE "latitude"."published_documents" CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queue_items" ADD CONSTRAINT "annotation_queue_items_annotation_queue_id_annotation_queues_id_fk" FOREIGN KEY ("annotation_queue_id") REFERENCES "latitude"."annotation_queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queue_items" ADD CONSTRAINT "annotation_queue_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queue_items" ADD CONSTRAINT "annotation_queue_items_completed_by_membership_id_memberships_id_fk" FOREIGN KEY ("completed_by_membership_id") REFERENCES "latitude"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queue_members" ADD CONSTRAINT "annotation_queue_members_annotation_queue_id_annotation_queues_id_fk" FOREIGN KEY ("annotation_queue_id") REFERENCES "latitude"."annotation_queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queue_members" ADD CONSTRAINT "annotation_queue_members_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "latitude"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queues" ADD CONSTRAINT "annotation_queues_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queues" ADD CONSTRAINT "annotation_queues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotation_queue_items_queue_id_idx" ON "latitude"."annotation_queue_items" USING btree ("annotation_queue_id");--> statement-breakpoint
CREATE INDEX "annotation_queue_items_workspace_id_idx" ON "latitude"."annotation_queue_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "annotation_queue_items_trace_id_idx" ON "latitude"."annotation_queue_items" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "annotation_queue_items_status_idx" ON "latitude"."annotation_queue_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "annotation_queue_items_queue_trace_unique_idx" ON "latitude"."annotation_queue_items" USING btree ("annotation_queue_id","trace_id");--> statement-breakpoint
CREATE INDEX "annotation_queue_members_queue_id_idx" ON "latitude"."annotation_queue_members" USING btree ("annotation_queue_id");--> statement-breakpoint
CREATE INDEX "annotation_queue_members_membership_id_idx" ON "latitude"."annotation_queue_members" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "annotation_queue_members_unique_idx" ON "latitude"."annotation_queue_members" USING btree ("annotation_queue_id","membership_id");--> statement-breakpoint
CREATE INDEX "annotation_queues_workspace_id_idx" ON "latitude"."annotation_queues" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "annotation_queues_project_id_idx" ON "latitude"."annotation_queues" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "annotation_queues_uuid_idx" ON "latitude"."annotation_queues" USING btree ("uuid");