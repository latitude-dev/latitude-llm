import type { ClickHouseClient } from "@clickhouse/client";

export const queryClickhouse = async <TRow extends Record<string, unknown>>(
  client: ClickHouseClient,
  query: string,
  queryParams?: Record<string, unknown>,
): Promise<ReadonlyArray<TRow>> => {
  const result = await client.query({
    query,
    query_params: queryParams,
    format: "JSONEachRow",
  });

  return result.json<TRow>();
};

export const commandClickhouse = async (
  client: ClickHouseClient,
  query: string,
  queryParams?: Record<string, unknown>,
): Promise<void> => {
  await client.command({
    query,
    query_params: queryParams,
  });
};

export const insertJsonEachRow = async <TRow extends Record<string, unknown>>(
  client: ClickHouseClient,
  table: string,
  values: ReadonlyArray<TRow>,
): Promise<void> => {
  if (values.length === 0) {
    return;
  }

  await client.insert({
    table,
    values,
    format: "JSONEachRow",
  });
};
