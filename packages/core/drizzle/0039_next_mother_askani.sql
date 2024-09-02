CREATE TABLE IF NOT EXISTS "latitude"."evaluations_template_categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD COLUMN "uuid" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "latitude"."evaluations_templates" ADD COLUMN "category" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "latitude"."evaluations_templates" ADD CONSTRAINT "evaluations_templates_category_evaluations_template_categories_id_fk" FOREIGN KEY ("category") REFERENCES "latitude"."evaluations_template_categories"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "latitude"."evaluations" ADD CONSTRAINT "evaluations_uuid_unique" UNIQUE("uuid");