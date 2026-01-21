COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY "spans_workspace_started_at_idx" ON "latitude"."spans" USING btree ("workspace_id","started_at");
