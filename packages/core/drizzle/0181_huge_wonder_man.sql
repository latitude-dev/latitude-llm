CREATE TABLE "latitude"."spans" (
	"id" varchar(16) NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"segment_id" varchar(32),
	"parent_id" varchar(16),
	"workspace_id" bigint NOT NULL,
	"api_key_id" bigint NOT NULL,
	"external_id" varchar(32),
	"name" varchar(128) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"source" varchar(32) NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"message" varchar(256),
	"duration" bigint NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "spans_trace_id_id_pk" PRIMARY KEY("trace_id","id")
);
--> statement-breakpoint
CREATE TABLE "latitude"."segments" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"trace_id" varchar(32) NOT NULL,
	"parent_id" varchar(32),
	"workspace_id" bigint NOT NULL,
	"api_key_id" bigint NOT NULL,
	"external_id" varchar(32),
	"name" varchar(128) NOT NULL,
	"source" varchar(32) NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"message" varchar(256),
	"commit_uuid" uuid NOT NULL,
	"document_uuid" uuid NOT NULL,
	"document_hash" varchar(64) NOT NULL,
	"document_type" varchar(32) NOT NULL,
	"experiment_uuid" uuid,
	"provider" varchar(128) NOT NULL,
	"model" varchar(128) NOT NULL,
	"tokens" bigint NOT NULL,
	"cost" bigint NOT NULL,
	"duration" bigint NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD CONSTRAINT "spans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD CONSTRAINT "spans_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "latitude"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."segments" ADD CONSTRAINT "segments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."segments" ADD CONSTRAINT "segments_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "latitude"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."segments" ADD CONSTRAINT "segments_commit_uuid_commits_uuid_fk" FOREIGN KEY ("commit_uuid") REFERENCES "latitude"."commits"("uuid") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."segments" ADD CONSTRAINT "segments_experiment_uuid_experiments_uuid_fk" FOREIGN KEY ("experiment_uuid") REFERENCES "latitude"."experiments"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spans_id_idx" ON "latitude"."spans" USING btree ("id");--> statement-breakpoint
CREATE INDEX "spans_trace_id_idx" ON "latitude"."spans" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "spans_segment_id_idx" ON "latitude"."spans" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "spans_trace_id_segment_id_idx" ON "latitude"."spans" USING btree ("trace_id","segment_id");--> statement-breakpoint
CREATE INDEX "spans_parent_id_idx" ON "latitude"."spans" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "spans_workspace_id_idx" ON "latitude"."spans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "spans_api_key_id_idx" ON "latitude"."spans" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "spans_external_id_idx" ON "latitude"."spans" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "spans_kind_started_at_idx" ON "latitude"."spans" USING btree ("kind","started_at");--> statement-breakpoint
CREATE INDEX "spans_source_started_at_idx" ON "latitude"."spans" USING btree ("source","started_at");--> statement-breakpoint
CREATE INDEX "spans_type_started_at_idx" ON "latitude"."spans" USING btree ("type","started_at");--> statement-breakpoint
CREATE INDEX "spans_status_started_at_idx" ON "latitude"."spans" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "spans_started_at_idx" ON "latitude"."spans" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "spans_started_at_brin_idx" ON "latitude"."spans" USING brin ("started_at") WITH (pages_per_range=32,autosummarize=true);--> statement-breakpoint
CREATE INDEX "segments_trace_id_idx" ON "latitude"."segments" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "segments_trace_id_id_idx" ON "latitude"."segments" USING btree ("trace_id","id");--> statement-breakpoint
CREATE INDEX "segments_parent_id_idx" ON "latitude"."segments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "segments_workspace_id_idx" ON "latitude"."segments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "segments_api_key_id_idx" ON "latitude"."segments" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "segments_external_id_idx" ON "latitude"."segments" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "segments_external_id_trgm_idx" ON "latitude"."segments" USING gin ("external_id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "segments_source_started_at_idx" ON "latitude"."segments" USING btree ("source","started_at");--> statement-breakpoint
CREATE INDEX "segments_type_started_at_idx" ON "latitude"."segments" USING btree ("type","started_at");--> statement-breakpoint
CREATE INDEX "segments_status_started_at_idx" ON "latitude"."segments" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "segments_commit_uuid_idx" ON "latitude"."segments" USING btree ("commit_uuid");--> statement-breakpoint
CREATE INDEX "segments_document_uuid_idx" ON "latitude"."segments" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX "segments_document_hash_idx" ON "latitude"."segments" USING btree ("document_hash");--> statement-breakpoint
CREATE INDEX "segments_experiment_uuid_idx" ON "latitude"."segments" USING btree ("experiment_uuid");--> statement-breakpoint
CREATE INDEX "segments_provider_idx" ON "latitude"."segments" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "segments_model_idx" ON "latitude"."segments" USING btree ("model");--> statement-breakpoint
CREATE INDEX "segments_started_at_idx" ON "latitude"."segments" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "segments_started_at_brin_idx" ON "latitude"."segments" USING brin ("started_at") WITH (pages_per_range=32,autosummarize=true);--> statement-breakpoint
CREATE INDEX "segments_ended_at_partial_idx" ON "latitude"."segments" USING btree ("ended_at") WHERE "latitude"."segments"."ended_at" is not null;