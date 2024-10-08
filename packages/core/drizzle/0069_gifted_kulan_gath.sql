UPDATE "latitude"."evaluation_results" SET uuid = gen_random_uuid() WHERE uuid IS NULL;
