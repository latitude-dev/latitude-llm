COMMIT;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "document_logs_custom_identifier_trgm_idx" ON "latitude"."document_logs" USING gin ("custom_identifier" gin_trgm_ops);