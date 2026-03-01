import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { parseEnv } from "@platform/env";
import { createLogger } from "@repo/observability";
import { config as loadDotenv } from "dotenv";
import { Effect } from "effect";
import { Hono } from "hono";
import { registerRoutes } from "./routes/index.js";

const nodeEnv = Effect.runSync(parseEnv(process.env.NODE_ENV, "string", "development"));
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const app = new Hono();
const port = Effect.runSync(parseEnv(process.env.PORT, "number", 3001));
const logger = createLogger("api");

registerRoutes({ app });

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info(`api listening on http://localhost:${info.port}`);
  },
);
