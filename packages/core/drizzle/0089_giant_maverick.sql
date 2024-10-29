ALTER TYPE "latitude"."log_source" ADD VALUE 'user';--> statement-breakpoint
ALTER TABLE "latitude"."document_logs" ALTER COLUMN "duration" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "provider_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "finish_reason" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "config" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "tokens" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "duration" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."provider_logs" ALTER COLUMN "generated_at" DROP NOT NULL;