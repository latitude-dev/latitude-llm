ALTER TABLE "latitude"."signals" ADD COLUMN "promoted_at" timestamp with time zone;--> statement-breakpoint
-- Every signal that existed before the promotion gate stays visible and keeps
-- announcing: the gate applies to newly discovered signals only. Retroactively
-- hiding signals people have already seen, triaged, or linked would be a worse
-- failure than leaving existing noise in place.
UPDATE "latitude"."signals" SET promoted_at = created_at WHERE promoted_at IS NULL;
