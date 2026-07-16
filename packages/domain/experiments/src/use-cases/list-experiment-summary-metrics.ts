import type { ChSqlClient, RepositoryError, ValidationError } from "@domain/shared"
import { Effect } from "effect"
import { SUMMARY_METRIC_CONCURRENCY } from "../constants.ts"
import type { Experiment } from "../entities/experiment.ts"
import type { ExperimentSummaryMetrics } from "../entities/variant-metrics.ts"
import { resolveVariantRange } from "../helpers.ts"
import { VariantMetricsReader } from "../ports/variant-metrics-reader.ts"

export interface ListExperimentSummaryMetricsInput {
  readonly experiments: readonly Experiment[]
  /** Anchor for resolving relative time ranges. Defaults to the current time. */
  readonly now?: Date
}

/**
 * Compute the two list-row aggregate columns per experiment — distinct sessions and distinct users
 * over the OR-union of the experiment's variant populations. Experiments with no variants report zeros.
 */
export const listExperimentSummaryMetricsUseCase = (
  input: ListExperimentSummaryMetricsInput,
): Effect.Effect<
  readonly ExperimentSummaryMetrics[],
  RepositoryError | ValidationError,
  ChSqlClient | VariantMetricsReader
> =>
  Effect.gen(function* () {
    const reader = yield* VariantMetricsReader
    const now = input.now ?? new Date()

    return yield* Effect.all(
      input.experiments.map((experiment) =>
        experiment.variants.length === 0
          ? Effect.succeed<ExperimentSummaryMetrics>({
              experimentId: experiment.id,
              sessionsDistinct: 0,
              usersDistinct: 0,
            })
          : reader
              .computeSummaryMetrics({
                organizationId: experiment.organizationId,
                projectId: experiment.projectId,
                populations: experiment.variants.map((variant) => ({
                  filterSet: variant.filterSet,
                  query: variant.query,
                  range: resolveVariantRange(variant.timeRange, now),
                })),
              })
              .pipe(
                Effect.map(
                  (counts): ExperimentSummaryMetrics => ({
                    experimentId: experiment.id,
                    sessionsDistinct: counts.sessionsDistinct,
                    usersDistinct: counts.usersDistinct,
                  }),
                ),
              ),
      ),
      // Each experiment's summary is one heavy union query over its variant populations; bound how
      // many run at once so a full list page can't saturate the shared ClickHouse pool.
      { concurrency: SUMMARY_METRIC_CONCURRENCY },
    )
  })
