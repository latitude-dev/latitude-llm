import type { ClickHouseClient } from "@clickhouse/client";
import { Data, Effect } from "effect";

export class ClickhouseQueryError extends Data.TaggedError("ClickhouseQueryError")<{
  readonly cause: unknown;
  readonly query: string;
}> {}

export class ClickhouseCommandError extends Data.TaggedError("ClickhouseCommandError")<{
  readonly cause: unknown;
  readonly query: string;
}> {}

export class ClickhouseInsertError extends Data.TaggedError("ClickhouseInsertError")<{
  readonly cause: unknown;
  readonly table: string;
}> {}

export const queryClickhouse = <TRow extends Record<string, unknown>>(
  client: ClickHouseClient,
  query: string,
  queryParams?: Record<string, unknown>,
): Effect.Effect<ReadonlyArray<TRow>, ClickhouseQueryError> =>
  Effect.tryPromise({
    try: async () => {
      const result = await client.query({
        query,
        ...(queryParams !== undefined && { query_params: queryParams }),
        format: "JSONEachRow",
      });

      return result.json<TRow>();
    },
    catch: (error) => new ClickhouseQueryError({ cause: error, query }),
  });

export const commandClickhouse = (
  client: ClickHouseClient,
  query: string,
  queryParams?: Record<string, unknown>,
): Effect.Effect<void, ClickhouseCommandError> =>
  Effect.tryPromise({
    try: () =>
      client.command({
        query,
        ...(queryParams !== undefined && { query_params: queryParams }),
      }),
    catch: (error) => new ClickhouseCommandError({ cause: error, query }),
  });

export const insertJsonEachRow = <TRow extends Record<string, unknown>>(
  client: ClickHouseClient,
  table: string,
  values: ReadonlyArray<TRow>,
): Effect.Effect<void, ClickhouseInsertError> =>
  Effect.gen(function* () {
    if (values.length === 0) {
      return;
    }

    yield* Effect.tryPromise({
      try: () =>
        client.insert({
          table,
          values,
          format: "JSONEachRow",
        }),
      catch: (error) => new ClickhouseInsertError({ cause: error, table }),
    });
  });
