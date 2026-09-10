import type { ClickHouseClient } from "@clickhouse/client"
import { type FleetLatencyCohortSample, FleetLatencyReferenceRepository } from "@domain/admin"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { LATENCY_INPUT_BUCKET_BOUNDS, LATENCY_OUTPUT_BUCKET_BOUNDS } from "@domain/spans"
import { Effect, Layer } from "effect"

/**
 * The bucket expression, generated from the domain's boundary table so SQL and TypeScript cannot
 * disagree about where a cohort starts.
 */
const bucketExpression = (
  bounds: readonly { readonly bucket: string; readonly upperExclusive: number | null }[],
  column: string,
): string => {
  const branches = bounds
    .filter(({ upperExclusive }) => upperExclusive !== null)
    .map(({ bucket, upperExclusive }) => `${column} < ${upperExclusive}, '${bucket}'`)
  const last = bounds[bounds.length - 1]?.bucket ?? ""
  return `multiIf(${branches.join(", ")}, '${last}')`
}

const INPUT_TOKENS = "toInt64(tokens_input) + toInt64(tokens_cache_read) + toInt64(tokens_cache_create)"
const OUTPUT_TOKENS = "toInt64(tokens_output) + toInt64(tokens_reasoning)"
const GENERATION_OPERATIONS = "('chat', 'text_completion', 'generate_content')"

type SampleRow = {
  provider: string
  model: string
  input_bucket: string | null
  output_bucket: string | null
  streaming: number | null
  sample_count: string | number
  organization_count: string | number
  median: string | number
}

const toSample = (row: SampleRow): FleetLatencyCohortSample => ({
  provider: row.provider,
  model: row.model,
  inputBucket: row.input_bucket === "" ? null : row.input_bucket,
  outputBucket: row.output_bucket === "" ? null : row.output_bucket,
  streaming: row.streaming === null ? null : row.streaming === 1,
  sampleCount: Number(row.sample_count),
  organizationCount: Number(row.organization_count),
  median: Number(row.median),
})

const windowParams = ({ since, until }: { readonly since: Date; readonly until: Date }) => ({
  since: since.toISOString().replace("T", " ").replace("Z", ""),
  until: until.toISOString().replace("T", " ").replace("Z", ""),
})

/**
 * Live layer for the fleet latency-reference port.
 *
 * ⚠️ SECURITY: cross-organisation by design — see the port doc. `start_time` is the partition key,
 * so a closed freeze window prunes partitions cheaply. Rows are not deduped by span id: a
 * re-ingested span shifts a fleet-wide median by nothing, and dedup over the whole cluster would
 * cost far more than it corrects.
 */
export const FleetLatencyReferenceRepositoryLive = Layer.effect(
  FleetLatencyReferenceRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const aggregate = ({
      metricExpression,
      guard,
      groupOutputBucket,
      window,
    }: {
      readonly metricExpression: string
      readonly guard: string
      readonly groupOutputBucket: boolean
      readonly window: { readonly since: Date; readonly until: Date }
    }) =>
      chSqlClient.query(async (client) => {
        const inputBucket = bucketExpression(LATENCY_INPUT_BUCKET_BOUNDS, INPUT_TOKENS)
        const outputBucket = bucketExpression(LATENCY_OUTPUT_BUCKET_BOUNDS, OUTPUT_TOKENS)
        const cohortColumns = groupOutputBucket
          ? `${inputBucket} AS input_bucket, ${outputBucket} AS output_bucket, is_streaming AS streaming`
          : `${inputBucket} AS input_bucket, '' AS output_bucket, is_streaming AS streaming`
        const providerModelColumns = "'' AS input_bucket, '' AS output_bucket, NULL AS streaming"
        const select = (columns: string, groupBy: string) => `
          SELECT provider, model, ${columns},
                 count() AS sample_count,
                 uniqExact(organization_id) AS organization_count,
                 quantileExact(0.5)(${metricExpression}) AS median
          FROM spans
          WHERE start_time >= {since:DateTime64(9, 'UTC')}
            AND start_time < {until:DateTime64(9, 'UTC')}
            AND operation IN ${GENERATION_OPERATIONS}
            AND provider != '' AND model != ''
            AND ${guard}
          GROUP BY provider, model${groupBy}`

        const result = await client.query({
          query: `${select(cohortColumns, groupOutputBucket ? ", input_bucket, output_bucket, streaming" : ", input_bucket, streaming")}
                  UNION ALL
                  ${select(providerModelColumns, "")}`,
          query_params: windowParams(window),
          format: "JSONEachRow",
        })
        return result.json<SampleRow>()
      })

    return {
      listTtftSamples: (input) =>
        aggregate({
          metricExpression: "time_to_first_token_ns",
          // Non-streaming first-token timing collapses into total duration, so it has no reference.
          guard: "is_streaming = 1 AND time_to_first_token_ns > 0",
          groupOutputBucket: false,
          window: input,
        }).pipe(
          Effect.map((rows) => rows.map(toSample)),
          Effect.mapError((error) => toRepositoryError(error, "FleetLatencyReferenceRepository.listTtftSamples")),
        ),

      listThroughputSamples: (input) =>
        aggregate({
          // Generation rate after the first token; a call with no post-first-token span has none.
          metricExpression: `(${OUTPUT_TOKENS}) / (greatest(reinterpretAsInt64(end_time) - reinterpretAsInt64(start_time) - toInt64(time_to_first_token_ns), 1) / 1000000000)`,
          guard: `(${OUTPUT_TOKENS}) > 0 AND reinterpretAsInt64(end_time) - reinterpretAsInt64(start_time) > toInt64(time_to_first_token_ns)`,
          groupOutputBucket: true,
          window: input,
        }).pipe(
          Effect.map((rows) => rows.map(toSample)),
          Effect.mapError((error) => toRepositoryError(error, "FleetLatencyReferenceRepository.listThroughputSamples")),
        ),
    }
  }),
)
