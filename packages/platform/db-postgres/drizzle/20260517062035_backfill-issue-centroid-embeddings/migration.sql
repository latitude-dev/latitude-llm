-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION "latitude"."normalize_issue_centroid_base"(base jsonb)
RETURNS vector(2048)
LANGUAGE sql
IMMUTABLE
AS $$
  WITH values AS (
    SELECT value::double precision AS component, ordinality
    FROM jsonb_array_elements_text(base) WITH ORDINALITY
  ), norm AS (
    SELECT sqrt(sum(component * component)) AS magnitude
    FROM values
  )
  SELECT (
    '[' || string_agg(
      CASE
        WHEN norm.magnitude > 0 THEN (values.component / norm.magnitude)::text
        ELSE '0'
      END,
      ',' ORDER BY values.ordinality
    ) || ']'
  )::vector(2048)
  FROM values CROSS JOIN norm
  GROUP BY norm.magnitude;
$$;
--> statement-breakpoint
UPDATE "latitude"."issues"
SET "centroid_embedding" = CASE
  WHEN ("centroid"->>'mass')::double precision <= 0 THEN NULL
  ELSE "latitude"."normalize_issue_centroid_base"("centroid"->'base')
END;
--> statement-breakpoint
DROP FUNCTION "latitude"."normalize_issue_centroid_base"(jsonb);
