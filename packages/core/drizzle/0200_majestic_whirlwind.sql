CREATE TABLE "latitude"."latte_requests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"thread_uuid" uuid NOT NULL,
	"credits" bigint NOT NULL,
	"billable" boolean NOT NULL,
	"error" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "latte_requests_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
ALTER TABLE "latitude"."latte_requests" ADD CONSTRAINT "latte_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "latitude"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."latte_requests" ADD CONSTRAINT "latte_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "latitude"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latitude"."latte_requests" ADD CONSTRAINT "latte_requests_thread_uuid_latte_threads_uuid_fk" FOREIGN KEY ("thread_uuid") REFERENCES "latitude"."latte_threads"("uuid") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "latte_requests_workspace_id_idx" ON "latitude"."latte_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "latte_requests_user_id_idx" ON "latitude"."latte_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "latte_requests_thread_uuid_idx" ON "latitude"."latte_requests" USING btree ("thread_uuid");--> statement-breakpoint
CREATE INDEX "latte_requests_credits_idx" ON "latitude"."latte_requests" USING btree ("workspace_id","created_at") INCLUDE ("credits", "billable");--> statement-breakpoint
CREATE INDEX "latte_requests_created_at_idx" ON "latitude"."latte_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "latte_requests_created_at_brin_idx" ON "latitude"."latte_requests" USING brin ("created_at") WITH (pages_per_range=32,autosummarize=true);