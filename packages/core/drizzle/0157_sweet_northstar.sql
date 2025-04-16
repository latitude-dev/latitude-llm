ALTER TYPE "latitude"."k8s_app_status" ADD VALUE 'unavailable';--> statement-breakpoint
DROP INDEX IF EXISTS "tokens_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cost_in_millicents_idx";