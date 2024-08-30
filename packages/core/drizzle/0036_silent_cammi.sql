ALTER TABLE "latitude"."magic_link_tokens" RENAME COLUMN "name" TO "token";--> statement-breakpoint
ALTER TABLE "latitude"."magic_link_tokens" DROP CONSTRAINT "magic_link_tokens_name_unique";--> statement-breakpoint
ALTER TABLE "latitude"."magic_link_tokens" ADD CONSTRAINT "magic_link_tokens_token_unique" UNIQUE("token");