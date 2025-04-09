DO $$ BEGIN
 CREATE TYPE "latitude"."oauth_providers" AS ENUM('google', 'github');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
