CREATE TABLE "latitude"."optimizations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"document_uuid" uuid NOT NULL,
	"baseline_commit_id" bigint NOT NULL,
	"baseline_prompt" text NOT NULL,
	"evaluation_uuid" uuid NOT NULL,
	"engine" varchar(32) NOT NULL,
	"configuration" jsonb NOT NULL,
	"trainset_id" bigint,
	"testset_id" bigint,
	"optimized_commit_id" bigint,
	"optimized_prompt" text,
	"baseline_experiment_id" bigint,
	"optimized_experiment_id" bigint,
	"error" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"prepared_at" timestamp,
	"executed_at" timestamp,
	"validated_at" timestamp,
	"finished_at" timestamp,
	CONSTRAINT "optimizations_uuid_unique" UNIQUE("uuid"),
	CONSTRAINT "optimizations_optimized_commit_id_unique" UNIQUE("optimized_commit_id"),
	CONSTRAINT "optimizations_baseline_experiment_id_unique" UNIQUE("baseline_experiment_id"),
	CONSTRAINT "optimizations_optimized_experiment_id_unique" UNIQUE("optimized_experiment_id")
);
--> statement-breakpoint
ALTER TABLE "latitude"."optimizations" ADD CONSTRAINT "optimizations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."optimizations" ADD CONSTRAINT "optimizations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "latitude"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."optimizations" ADD CONSTRAINT "optimizations_baseline_commit_id_commits_id_fk" FOREIGN KEY ("baseline_commit_id") REFERENCES "latitude"."commits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."optimizations" ADD CONSTRAINT "optimizations_trainset_id_datasets_v2_id_fk" FOREIGN KEY ("trainset_id") REFERENCES "latitude"."datasets_v2"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."optimizations" ADD CONSTRAINT "optimizations_testset_id_datasets_v2_id_fk" FOREIGN KEY ("testset_id") REFERENCES "latitude"."datasets_v2"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."optimizations" ADD CONSTRAINT "optimizations_optimized_commit_id_commits_id_fk" FOREIGN KEY ("optimized_commit_id") REFERENCES "latitude"."commits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."optimizations" ADD CONSTRAINT "optimizations_baseline_experiment_id_experiments_id_fk" FOREIGN KEY ("baseline_experiment_id") REFERENCES "latitude"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."optimizations" ADD CONSTRAINT "optimizations_optimized_experiment_id_experiments_id_fk" FOREIGN KEY ("optimized_experiment_id") REFERENCES "latitude"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "optimizations_workspace_id_idx" ON "latitude"."optimizations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "optimizations_project_id_idx" ON "latitude"."optimizations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "optimizations_document_uuid_idx" ON "latitude"."optimizations" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX "optimizations_baseline_commit_id_idx" ON "latitude"."optimizations" USING btree ("baseline_commit_id");--> statement-breakpoint
CREATE INDEX "optimizations_evaluation_uuid_idx" ON "latitude"."optimizations" USING btree ("evaluation_uuid");--> statement-breakpoint
CREATE INDEX "optimizations_engine_idx" ON "latitude"."optimizations" USING btree ("engine","created_at");--> statement-breakpoint
CREATE INDEX "optimizations_trainset_id_idx" ON "latitude"."optimizations" USING btree ("trainset_id");--> statement-breakpoint
CREATE INDEX "optimizations_testset_id_idx" ON "latitude"."optimizations" USING btree ("testset_id");--> statement-breakpoint
CREATE INDEX "optimizations_created_at_idx" ON "latitude"."optimizations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "optimizations_prepared_at_idx" ON "latitude"."optimizations" USING btree ("prepared_at");--> statement-breakpoint
CREATE INDEX "optimizations_executed_at_idx" ON "latitude"."optimizations" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "optimizations_validated_at_idx" ON "latitude"."optimizations" USING btree ("validated_at");--> statement-breakpoint
CREATE INDEX "optimizations_finished_at_idx" ON "latitude"."optimizations" USING btree ("finished_at");