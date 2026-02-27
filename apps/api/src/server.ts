import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createClickhouseClient, healthcheckClickhouse } from "@platform/db-clickhouse";
import { createPostgresClient, healthcheckPostgres } from "@platform/db-postgres";
import { config as loadDotenv } from "dotenv";
import { Hono } from "hono";

const nodeEnv = process.env.NODE_ENV ?? "development";
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const app = new Hono();
const postgres = createPostgresClient();
const clickhouse = createClickhouseClient();

app.get("/health", async (c) => {
  const checks = await Promise.allSettled([
    healthcheckPostgres(postgres.pool),
    healthcheckClickhouse(clickhouse),
  ]);

  const postgresHealth = checks[0];
  const clickhouseHealth = checks[1];
  const ok = postgresHealth.status === "fulfilled" && clickhouseHealth.status === "fulfilled";

  return c.json(
    {
      service: "api",
      status: ok ? "ok" : "degraded",
      postgres:
        postgresHealth.status === "fulfilled"
          ? postgresHealth.value
          : { ok: false, error: String(postgresHealth.reason) },
      clickhouse:
        clickhouseHealth.status === "fulfilled"
          ? clickhouseHealth.value
          : { ok: false, error: String(clickhouseHealth.reason) },
    },
    ok ? 200 : 503,
  );
});

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3001),
  },
  (info) => {
    console.log(`api listening on http://localhost:${info.port}`);
  },
);
