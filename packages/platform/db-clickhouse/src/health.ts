import type { ClickHouseClient } from "@clickhouse/client";
import { Effect } from "effect";

export interface ClickhouseHealth {
  readonly ok: boolean;
  readonly latencyMs: number;
}

export const healthcheckClickhouse = (
  client: ClickHouseClient,
): Effect.Effect<ClickhouseHealth, unknown> => {
  return Effect.gen(function* () {
    const start = Date.now();
    yield* Effect.tryPromise(() => client.ping());
    const latencyMs = Date.now() - start;

    return { ok: true, latencyMs };
  });
};
