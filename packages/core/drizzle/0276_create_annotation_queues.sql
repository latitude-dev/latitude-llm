-- Migration 0033 added "id" bigserial to memberships but never promoted it to PK.
-- The FK on annotation_queue_members.membership_id requires a PK on memberships.id.
ALTER TABLE "latitude"."memberships" DROP CONSTRAINT IF EXISTS "memberships_pkey";--> statement-breakpoint
ALTER TABLE "latitude"."memberships" DROP CONSTRAINT IF EXISTS "memberships_workspace_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "latitude"."memberships" ADD PRIMARY KEY ("id");--> statement-breakpoint

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
	"workspace_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queue_members" ADD CONSTRAINT "annotation_queue_members_annotation_queue_id_annotation_queues_id_fk" FOREIGN KEY ("annotation_queue_id") REFERENCES "latitude"."annotation_queues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queue_members" ADD CONSTRAINT "annotation_queue_members_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "latitude"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queues" ADD CONSTRAINT "annotation_queues_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queues" ADD CONSTRAINT "annotation_queues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotation_queue_members_queue_id_idx" ON "latitude"."annotation_queue_members" USING btree ("annotation_queue_id");--> statement-breakpoint
CREATE INDEX "annotation_queue_members_membership_id_idx" ON "latitude"."annotation_queue_members" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "annotation_queue_members_unique_idx" ON "latitude"."annotation_queue_members" USING btree ("annotation_queue_id","membership_id");--> statement-breakpoint
CREATE INDEX "annotation_queues_workspace_id_idx" ON "latitude"."annotation_queues" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "annotation_queues_project_id_idx" ON "latitude"."annotation_queues" USING btree ("project_id");
