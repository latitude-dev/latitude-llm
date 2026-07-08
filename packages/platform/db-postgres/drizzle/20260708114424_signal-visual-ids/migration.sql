CREATE SEQUENCE "latitude"."signal_visual_id_seq" START WITH 1;--> statement-breakpoint
ALTER TABLE "latitude"."signals" ADD COLUMN "visual_id" varchar(16);--> statement-breakpoint
WITH numbered AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at ASC, id ASC) AS seq
  FROM "latitude"."signals"
)
UPDATE "latitude"."signals" AS s
SET visual_id = 'LAT-' || lpad(n.seq::text, 3, '0')
FROM numbered AS n
WHERE s.id = n.id;--> statement-breakpoint
ALTER TABLE "latitude"."signals" ALTER COLUMN "visual_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "signals_visual_id_idx" ON "latitude"."signals" ("visual_id");--> statement-breakpoint
SELECT setval(
  '"latitude"."signal_visual_id_seq"',
  GREATEST(
    COALESCE((SELECT MAX(seq) FROM (
      SELECT row_number() OVER (ORDER BY created_at ASC, id ASC) AS seq
      FROM "latitude"."signals"
    ) numbered), 0),
    1
  ),
  (SELECT COUNT(*) > 0 FROM "latitude"."signals")
);
