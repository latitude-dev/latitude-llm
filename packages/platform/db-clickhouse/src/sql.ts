import type { ClickHouseClient } from "@clickhouse/client"
import { Data, Effect } from "effect"

class ClickhouseQueryError extends Data.TaggedError("ClickhouseQueryError")<{
  readonly cause: unknown
  readonly query: string
}> {}

class ClickhouseCommandError extends Data.TaggedError("ClickhouseCommandError")<{
  readonly cause: unknown
  readonly query: string
}> {}

class ClickhouseInsertError extends Data.TaggedError("ClickhouseInsertError")<{
  readonly cause: unknown
  readonly table: string
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
      })

      return result.json<TRow>()
    },
    catch: (error) => new ClickhouseQueryError({ cause: error, query }),
  })

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
  })

/**
 * Max rows per `client.insert()` HTTP request. Large seed inserts (e.g. the
 * ~40k deterministic demo spans, whose message blobs alone run to hundreds of
 * MiB) must be chunked: a single insert of that size completes fine against a
 * localhost ClickHouse but stalls against a remote/managed one — the giant
 * HTTP body trips request-size/memory limits or proxy timeouts, the call never
 * returns, and the Temporal seed activity sits until its start-to-close
 * timeout. Chunking caps each request's body so the insert stays well within
 * remote limits. ClickHouse inserts aren't transactional, so splitting one
 * logical insert into several is behaviourally equivalent here.
 */
const INSERT_BATCH_SIZE = 500

export const insertJsonEachRow = <TRow extends Record<string, unknown>>(
  client: ClickHouseClient,
  table: string,
  values: ReadonlyArray<TRow>,
): Effect.Effect<void, ClickhouseInsertError> =>
  Effect.gen(function* () {
    if (values.length === 0) return

    for (let offset = 0; offset < values.length; offset += INSERT_BATCH_SIZE) {
      const batch = values.slice(offset, offset + INSERT_BATCH_SIZE)
      yield* Effect.tryPromise({
        try: () =>
          client.insert({
            table,
            values: batch,
            format: "JSONEachRow",
          }),
        catch: (error) => new ClickhouseInsertError({ cause: error, table }),
      })
    }
  })
