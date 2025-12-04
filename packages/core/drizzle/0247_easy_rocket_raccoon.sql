ALTER TABLE "latitude"."deployment_test_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "latitude"."deployment_test_runs" CASCADE;--> statement-breakpoint
ALTER TABLE "latitude"."spans" ADD COLUMN "test_deployment_id" bigint;--> statement-breakpoint
CREATE INDEX "idx_deployment_tests_project_type_status" ON "latitude"."deployment_tests" USING btree ("project_id","test_type","status");--> statement-breakpoint
CREATE INDEX "spans_test_deployment_id_idx" ON "latitude"."spans" USING btree ("test_deployment_id");