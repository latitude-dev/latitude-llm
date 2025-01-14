DO $$ BEGIN
 CREATE TYPE "latitude"."span_internal_types" AS ENUM('default', 'generation');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "latitude"."span_kinds" AS ENUM('internal', 'server', 'client', 'producer', 'consumer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."traces" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"project_id" bigint NOT NULL,
	"name" varchar(256),
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"attributes" jsonb,
	"status" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "traces_trace_id_unique" UNIQUE("trace_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."spans" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"span_id" varchar(16) NOT NULL,
	"parent_span_id" varchar(16),
	"name" varchar(256) NOT NULL,
	"kind" "latitude"."span_kinds" NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"attributes" jsonb,
	"status" varchar(64),
	"status_message" text,
	"events" jsonb,
	"links" jsonb,
	"model" varchar,
	"model_parameters" jsonb,
	"input" jsonb,
	"output" jsonb,
	"prompt_tokens" bigint DEFAULT 0,
	"completion_tokens" bigint DEFAULT 0,
	"total_tokens" bigint DEFAULT 0,
	"input_cost_in_millicents" integer DEFAULT 0,
	"output_cost_in_millicents" integer DEFAULT 0,
	"total_cost_in_millicents" integer DEFAULT 0,
	"tool_calls" jsonb,
	"internal_type" "latitude"."span_internal_types",
	"distinct_id" varchar(256),
	"metadata" jsonb,
	"prompt_path" varchar(256),
	"commit_uuid" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "spans_span_id_unique" UNIQUE("span_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."traces" ADD CONSTRAINT "traces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."spans" ADD CONSTRAINT "spans_trace_id_traces_trace_id_fk" FOREIGN KEY ("trace_id") REFERENCES "latitude"."traces"("trace_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_project_id_idx" ON "latitude"."traces" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_trace_id_idx" ON "latitude"."traces" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traces_start_time_idx" ON "latitude"."traces" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_trace_id_idx" ON "latitude"."spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_span_id_idx" ON "latitude"."spans" USING btree ("span_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_parent_span_id_idx" ON "latitude"."spans" USING btree ("parent_span_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spans_start_time_idx" ON "latitude"."spans" USING btree ("start_time");