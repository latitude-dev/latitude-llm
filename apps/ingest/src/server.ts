import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createClickhouseClient, healthcheckClickhouse } from "@platform/db-clickhouse";
import { config as loadDotenv } from "dotenv";
import { Hono } from "hono";

const nodeEnv = process.env.NODE_ENV ?? "development";
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const app = new Hono();
const clickhouse = createClickhouseClient();

app.get("/health", async (c) => {
  try {
    const clickhouseHealth = await healthcheckClickhouse(clickhouse);

    return c.json({ service: "ingest", status: "ok", clickhouse: clickhouseHealth }, 200);
  } catch (error) {
    return c.json(
      {
        service: "ingest",
        status: "degraded",
        clickhouse: { ok: false, error: String(error) },
      },
      503,
    );
  }
});

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3002),
  },
  (info) => {
    console.log(`ingest listening on http://localhost:${info.port}`);
  },
);
