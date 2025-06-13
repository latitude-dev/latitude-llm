CREATE TABLE "latitude"."latte_threads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "latte_threads_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "latitude"."latte_thread_checkpoints" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"thread_uuid" uuid NOT NULL,
	"commit_id" bigint NOT NULL,
	"document_uuid" uuid NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
ALTER TABLE "latitude"."latte_threads" ADD CONSTRAINT "latte_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."latte_threads" ADD CONSTRAINT "latte_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."latte_thread_checkpoints" ADD CONSTRAINT "latte_thread_checkpoints_thread_uuid_latte_threads_uuid_fk" FOREIGN KEY ("thread_uuid") REFERENCES "latitude"."latte_threads"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."latte_thread_checkpoints" ADD CONSTRAINT "latte_thread_checkpoints_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "latitude"."commits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "latte_threads_uuid_index" ON "latitude"."latte_threads" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "latte_threads_user_workspace_index" ON "latitude"."latte_threads" USING btree ("user_id","workspace_id");--> statement-breakpoint
CREATE INDEX "latte_thread_checkpoints_commit_id_index" ON "latitude"."latte_thread_checkpoints" USING btree ("commit_id");--> statement-breakpoint
CREATE INDEX "latte_thread_checkpoints_thread_uuid_index" ON "latitude"."latte_thread_checkpoints" USING btree ("thread_uuid");