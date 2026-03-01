import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { serve } from "@hono/node-server";
import { parseEnv } from "@platform/env";
import { createLogger } from "@repo/observability";
import { Effect } from "effect";
import { Hono } from "hono";
import { registerRoutes } from "./routes/index.js";

const nodeEnv = process.env.NODE_ENV || "development";
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const app = new Hono();
const port = Effect.runSync(parseEnv(process.env.PORT, "number", 3002));

const logger = createLogger("ingest");

registerRoutes({ app });

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info(`ingest listening on http://localhost:${info.port}`);
  },
);
