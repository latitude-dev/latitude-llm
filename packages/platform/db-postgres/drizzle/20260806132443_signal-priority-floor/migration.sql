ALTER TABLE "latitude"."signals" ADD COLUMN "priority_floor" varchar(16);--> statement-breakpoint
-- Existing levels were set by a person or by the discovery rubric, so they carry
-- the same assertion the column now records. Without this the first volume
-- recompute would quietly demote every rated signal, including anything already
-- triaged as urgent. Deterministic-detector signals are indistinguishable from
-- rubric-rated ones at this point, so they are floored too; the floor releases
-- as soon as someone clears the priority.
UPDATE "latitude"."signals" SET "priority_floor" = "priority" WHERE "priority" IS NOT NULL;
