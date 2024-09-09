CREATE TABLE IF NOT EXISTS "latitude"."events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" varchar(256) NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_type_idx" ON "latitude"."events" USING btree ("type");