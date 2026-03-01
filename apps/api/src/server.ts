import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createBetterAuth } from "@platform/auth-better";
import { createRedisClient, createRedisConnection } from "@platform/cache-redis";
import { createPostgresClient } from "@platform/db-postgres";
import { parseEnv } from "@platform/env";
import { createLogger } from "@repo/observability";
import { config as loadDotenv } from "dotenv";
import { Effect } from "effect";
import { Hono } from "hono";
import { honoErrorHandler } from "./middleware/error-handler.js";
import { registerRoutes } from "./routes/index.js";

const nodeEnv = process.env.NODE_ENV || "development";
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath });

const app = new Hono();
const port = Effect.runSync(parseEnv(process.env.PORT, "number", 3001));
const logger = createLogger("api");

// Initialize database client
const { db } = createPostgresClient();

// Initialize Redis (required for rate limiting)
const redisConn = createRedisConnection();
const redisClient = createRedisClient(redisConn);
logger.info("Redis connected for rate limiting");

// Initialize Better Auth
const betterAuthSecret = Effect.runSync(parseEnv(process.env.BETTER_AUTH_SECRET, "string"));

const auth = createBetterAuth({
  db,
  secret: betterAuthSecret,
});

// Register global error handler
app.onError(honoErrorHandler);

registerRoutes({ app, db, auth: { handler: auth.handler, api: auth.api }, redis: redisClient });

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info(`api listening on http://localhost:${info.port}`);
  },
);
