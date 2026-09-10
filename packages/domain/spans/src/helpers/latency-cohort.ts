/**
 * Cohort keys for the frozen latency references.
 *
 * TTFT and generation throughput have a direction but no universal scale, so a call is only ever
 * compared with equivalent calls: same serving provider, same model, same prompt size, same
 * streaming mode, and for throughput the same output size. The buckets are part of the scoring
 * version — moving a boundary re-cohorts every reading.
 */

/**
 * Prompt-size boundaries fixed by the score definition, ordered, upper bound exclusive.
 *
 * The boundary table is the single source of truth: the bucket functions below and the fleet
 * aggregation's SQL both derive from it, so a re-bucketing cannot land on one side only.
 */
export const LATENCY_INPUT_BUCKET_BOUNDS = [
  { bucket: "under1k", upperExclusive: 1_000 },
  { bucket: "from1kTo4k", upperExclusive: 4_000 },
  { bucket: "from4kTo16k", upperExclusive: 16_000 },
  { bucket: "from16kTo64k", upperExclusive: 64_000 },
  { bucket: "over64k", upperExclusive: null },
] as const

/** Output-size boundaries, which join the throughput cohort so a rate estimate has stable support. */
export const LATENCY_OUTPUT_BUCKET_BOUNDS = [
  { bucket: "under256", upperExclusive: 256 },
  { bucket: "from256To1k", upperExclusive: 1_000 },
  { bucket: "from1kTo4k", upperExclusive: 4_000 },
  { bucket: "over4k", upperExclusive: null },
] as const

export const LATENCY_INPUT_BUCKETS = LATENCY_INPUT_BUCKET_BOUNDS.map(({ bucket }) => bucket)
export type LatencyInputBucket = (typeof LATENCY_INPUT_BUCKET_BOUNDS)[number]["bucket"]

export const LATENCY_OUTPUT_BUCKETS = LATENCY_OUTPUT_BUCKET_BOUNDS.map(({ bucket }) => bucket)
export type LatencyOutputBucket = (typeof LATENCY_OUTPUT_BUCKET_BOUNDS)[number]["bucket"]

const bucketFor = <Bucket extends string>(
  bounds: readonly { readonly bucket: Bucket; readonly upperExclusive: number | null }[],
  tokens: number,
): Bucket => {
  const match = bounds.find(({ upperExclusive }) => upperExclusive !== null && tokens < upperExclusive)
  return match?.bucket ?? (bounds[bounds.length - 1]?.bucket as Bucket)
}

/** Whole prompt side, cache included: what the provider had to read before the first token. */
export const latencyInputTokens = ({
  tokensInput,
  tokensCacheRead,
  tokensCacheCreate,
}: {
  readonly tokensInput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
}): number => Math.max(0, tokensInput) + Math.max(0, tokensCacheRead) + Math.max(0, tokensCacheCreate)

/** Whole generated side: reasoning tokens cost generation time even when they are not returned. */
export const latencyOutputTokens = ({
  tokensOutput,
  tokensReasoning,
}: {
  readonly tokensOutput: number
  readonly tokensReasoning: number
}): number => Math.max(0, tokensOutput) + Math.max(0, tokensReasoning)

export const latencyInputBucket = (inputTokens: number): LatencyInputBucket =>
  bucketFor(LATENCY_INPUT_BUCKET_BOUNDS, inputTokens)

export const latencyOutputBucket = (outputTokens: number): LatencyOutputBucket =>
  bucketFor(LATENCY_OUTPUT_BUCKET_BOUNDS, outputTokens)

export interface LatencyCohortKey {
  readonly provider: string
  readonly model: string
  readonly inputBucket: LatencyInputBucket
  readonly streaming: boolean
}

export interface ThroughputCohortKey extends LatencyCohortKey {
  readonly outputBucket: LatencyOutputBucket
}

/** NUL, for the same reason the memory ledger uses it: it cannot occur in a provider or model name. */
const COHORT_KEY_SEPARATOR = "\u0000"

export const latencyCohortId = (key: LatencyCohortKey): string =>
  [key.provider, key.model, key.inputBucket, key.streaming ? "streaming" : "unary"].join(COHORT_KEY_SEPARATOR)

export const throughputCohortId = (key: ThroughputCohortKey): string =>
  [latencyCohortId(key), key.outputBucket].join(COHORT_KEY_SEPARATOR)

export const providerModelCohortId = ({
  provider,
  model,
}: {
  readonly provider: string
  readonly model: string
}): string => [provider, model].join(COHORT_KEY_SEPARATOR)
