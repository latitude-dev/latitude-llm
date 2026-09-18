import type { RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * One candidate cohort reading, at whichever granularity the aggregation grouped it.
 *
 * `inputBucket`, `outputBucket` and `streaming` are null on a provider/model roll-up — the coarser
 * level the reference lookup falls back to. `organizationCount` is what makes a cohort publishable:
 * a median drawn from one tenant's private deployment would leak that tenant's performance into
 * every other project's score.
 */
export interface FleetLatencyCohortSample {
  readonly provider: string
  readonly model: string
  readonly inputBucket: string | null
  readonly outputBucket: string | null
  readonly streaming: boolean | null
  readonly sampleCount: number
  readonly organizationCount: number
  /** Median time to first token in nanoseconds, or median generation rate in tokens per second. */
  readonly median: number
}

export interface ListFleetLatencySamplesInput {
  /** Inclusive lower bound on span start time. */
  readonly since: Date
  /** Exclusive upper bound, so a freeze covers a closed window and reruns reproduce it. */
  readonly until: Date
}

/**
 * Cross-organisation latency aggregation, used once per scoring version to freeze the TTFT and
 * throughput references.
 *
 * WARNING: cross-tenant by design — the queries scan `spans` over every organisation in the
 * cluster. Only ever wire it into handlers that have already passed `adminMiddleware`, and never
 * alongside per-tenant ClickHouse repositories on a customer-facing path. Nothing here may reach a
 * live score: the score reads the frozen artifact, so one project's traffic can never move
 * another's number.
 */
export class FleetLatencyReferenceRepository extends Context.Service<
  FleetLatencyReferenceRepository,
  {
    /** Streaming chat spans with a usable first-token reading, by cohort and by provider/model. */
    listTtftSamples(
      input: ListFleetLatencySamplesInput,
    ): Effect.Effect<readonly FleetLatencyCohortSample[], RepositoryError>

    /** Generation spans with output tokens and a post-first-token duration, at both granularities. */
    listThroughputSamples(
      input: ListFleetLatencySamplesInput,
    ): Effect.Effect<readonly FleetLatencyCohortSample[], RepositoryError>
  }
>()("@domain/admin/FleetLatencyReferenceRepository") {}
