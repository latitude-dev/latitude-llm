COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY "spans_workspace_commit_started_at_id_idx" ON "latitude"."spans" USING btree ("workspace_id","commit_uuid","started_at","id");
