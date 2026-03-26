CREATE TABLE "latitude"."annotation_queue_items" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"queue_id" varchar(24) NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotation_queue_items_unique_trace_per_queue_idx" UNIQUE("organization_id","project_id","queue_id","trace_id")
);
--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queue_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "latitude"."annotation_queues" (
	"id" varchar(24) PRIMARY KEY,
	"organization_id" varchar(24) NOT NULL,
	"project_id" varchar(24) NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text NOT NULL,
	"instructions" text NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"assignees" varchar(24)[] DEFAULT '{}'::varchar(24)[] NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"completed_items" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotation_queues_unique_name_per_project_idx" UNIQUE NULLS NOT DISTINCT("organization_id","project_id","name","deleted_at")
);
--> statement-breakpoint
ALTER TABLE "latitude"."annotation_queues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "annotation_queue_items_queue_progress_idx" ON "latitude"."annotation_queue_items" ("organization_id","project_id","queue_id","completed_at","created_at","trace_id");--> statement-breakpoint
CREATE INDEX "annotation_queues_project_list_idx" ON "latitude"."annotation_queues" ("organization_id","project_id","deleted_at","created_at");--> statement-breakpoint
CREATE POLICY "annotation_queue_items_organization_policy" ON "latitude"."annotation_queue_items" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());--> statement-breakpoint
CREATE POLICY "annotation_queues_organization_policy" ON "latitude"."annotation_queues" AS PERMISSIVE FOR ALL TO public USING (organization_id = get_current_organization_id()) WITH CHECK (organization_id = get_current_organization_id());