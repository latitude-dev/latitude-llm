import {
  type AnalyticsStream,
  type ProjectId,
  type RepositoryError,
  SignalId,
  type SqlClient,
  TaxonomyClusterId,
} from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { TaxonomyClusterRepository } from "@domain/taxonomy"
import { Effect } from "effect"

/** Breakdown key → human label for one stream's breakdown values. */
export type BreakdownLabels = ReadonlyMap<string, string>

type LabelResolver = (input: {
  readonly projectId: ProjectId
  readonly keys: readonly string[]
}) => Effect.Effect<BreakdownLabels, RepositoryError, SignalRepository | TaxonomyClusterRepository | SqlClient>

/**
 * Per-stream, per-breakdown label resolvers — the analytics surface's own spec of
 * how each stream names its breakdown values. A breakdown appears here ONLY when
 * its key is an opaque id whose display name lives outside the analytics store
 * (signals + taxonomy clusters in Postgres). Readable-enum breakdowns (`model`,
 * `kind`, `source`, `status`, …) come back self-describing and intentionally have
 * no resolver. Adding a stream with an id-breakdown = adding an entry here; the
 * route stays generic and never learns stream-specific rules.
 */
const BREAKDOWN_LABEL_RESOLVERS: Partial<Record<AnalyticsStream, Readonly<Record<string, LabelResolver>>>> = {
  scores: {
    signalId: ({ projectId, keys }) =>
      Effect.gen(function* () {
        const signals = yield* (yield* SignalRepository).findByIds({
          projectId,
          signalIds: keys.map(SignalId),
        })
        return new Map(signals.map((signal) => [signal.id as string, signal.name]))
      }),
  },
  behaviors: {
    cluster: ({ keys }) =>
      Effect.gen(function* () {
        const clusters = yield* (yield* TaxonomyClusterRepository).listByIds(keys.map(TaxonomyClusterId))
        return new Map(clusters.map((cluster) => [cluster.id as string, cluster.name]))
      }),
  },
}

/**
 * Resolve a breakdown's keys to human labels for the given stream, or `undefined`
 * when the breakdown is already readable (no registered resolver) or there is
 * nothing to resolve. The caller provides the label repositories via layers.
 */
export const resolveBreakdownLabels = (input: {
  readonly stream: AnalyticsStream
  readonly breakdown: string | undefined
  readonly projectId: ProjectId
  readonly keys: readonly string[]
}): Effect.Effect<
  BreakdownLabels | undefined,
  RepositoryError,
  SignalRepository | TaxonomyClusterRepository | SqlClient
> =>
  Effect.gen(function* () {
    if (!input.breakdown || input.keys.length === 0) return undefined
    const resolver = BREAKDOWN_LABEL_RESOLVERS[input.stream]?.[input.breakdown]
    if (!resolver) return undefined
    return yield* resolver({ projectId: input.projectId, keys: input.keys })
  })
