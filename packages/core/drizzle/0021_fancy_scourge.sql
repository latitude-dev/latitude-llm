DO $$ BEGIN
 CREATE TYPE "latitude"."provider" AS ENUM('openai', 'anthropic', 'groq', 'mistal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
