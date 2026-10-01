ALTER TABLE "latitude"."flaggers" ADD COLUMN "sampling_source" varchar(16) DEFAULT 'default' NOT NULL;--> statement-breakpoint
-- Provisioning writes sampling = 10 (FLAGGER_DEFAULT_SAMPLING) for every row, so any other rate is
-- one somebody chose. Marking those rows user-managed keeps the Agent Score sweep off them.
UPDATE "latitude"."flaggers" SET "sampling_source" = 'user' WHERE "sampling" <> 10;
