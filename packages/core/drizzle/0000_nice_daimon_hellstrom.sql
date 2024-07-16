CREATE SCHEMA "latitude";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "latitude"."document_hierarchies" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"parent_id" bigint,
	"depth" integer NOT NULL,
	"child_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
