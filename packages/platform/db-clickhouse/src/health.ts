import type { ClickHouseClient } from "@clickhouse/client";

export interface ClickhouseHealth {
  readonly ok: boolean;
  readonly latencyMs: number;
}

export const healthcheckClickhouse = async (
  client: ClickHouseClient,
): Promise<ClickhouseHealth> => {
  const start = Date.now();
  await client.ping();
  const latencyMs = Date.now() - start;

  return { ok: true, latencyMs };
};
