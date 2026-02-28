import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createClickhouseClientEffect, healthcheckClickhouse } from "@platform/db-clickhouse";
import { createPostgresClientEffect, healthcheckPostgres } from "@platform/db-postgres";
import { parseEnv } from "@platform/env";
import { config as loadDotenv } from "dotenv";
import { Effect } from "effect";
import { Hono } from "hono";

const nodeEnv = Effect.runSync(parseEnv(process.env.NODE_ENV, "string", "development"));
const envFilePath = fileURLToPath(new URL(`../../../.env.${nodeEnv}`, import.meta.url));

if (existsSync(envFilePath)) {
  loadDotenv({ path: envFilePath });
}

const app = new Hono();
const postgres = Effect.runSync(createPostgresClientEffect());
const clickhouse = Effect.runSync(createClickhouseClientEffect());
const port = Effect.runSync(parseEnv(process.env.PORT, "number", 3001));

type HealthcheckFailure = {
  readonly ok: false;
  readonly error: string;
};

const withFailure = <TSuccess extends { readonly ok: boolean }>(
  effect: Effect.Effect<TSuccess, unknown>,
): Effect.Effect<TSuccess | HealthcheckFailure> => {
  return Effect.match(effect, {
    onFailure: (error) => ({ ok: false, error: String(error) }),
    onSuccess: (value) => value,
  });
};

app.get("/health", async (c) => {
  const health = await Effect.runPromise(
    Effect.all({
      postgres: withFailure(healthcheckPostgres(postgres.pool)),
      clickhouse: withFailure(healthcheckClickhouse(clickhouse)),
    }),
  );

  const ok = health.postgres.ok && health.clickhouse.ok;

  return c.json(
    {
      service: "api",
      status: ok ? "ok" : "degraded",
      postgres: health.postgres,
      clickhouse: health.clickhouse,
    },
    ok ? 200 : 503,
  );
});

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    Effect.runSync(Effect.logInfo(`api listening on http://localhost:${info.port}`));
  },
);
