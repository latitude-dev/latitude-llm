COMMIT;
--> statement-breakpoint

CREATE INDEX CONCURRENTLY "spans_workspace_type_source_idx" ON "latitude"."spans" USING btree ("workspace_id","type","source");
