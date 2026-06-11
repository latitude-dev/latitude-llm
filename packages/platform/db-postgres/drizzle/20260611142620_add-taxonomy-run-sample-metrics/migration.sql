ALTER TABLE "latitude"."taxonomy_runs" ADD COLUMN "observations_available" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_runs" ADD COLUMN "observations_sampled" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_runs" ADD COLUMN "sample_strategy" varchar(64) DEFAULT 'day_stratified_hash_round_robin' NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."taxonomy_runs" ADD COLUMN "sample_cap" integer DEFAULT 1500 NOT NULL;