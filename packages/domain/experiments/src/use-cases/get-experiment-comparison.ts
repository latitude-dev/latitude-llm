import type { ChSqlClient, NotFoundError, ProjectId, RepositoryError, SqlClient, ValidationError } from "@domain/shared"
import { Effect } from "effect"
import {
  DEVIATION_METRIC_KEYS,
  EXPERIMENT_METRICS,
  type ExperimentMetricKey,
  POPULATION_DEVIATION_THRESHOLD,
  VARIANT_METRIC_CONCURRENCY,
} from "../constants.ts"
import type { ExperimentComparison, MetricDeltaValue, VariantComparison } from "../entities/variant-metrics.ts"
import { computeDelta, queryHasSemanticComponent, resolveVariantRange } from "../helpers.ts"
import { ExperimentRepository } from "../ports/experiment-repository.ts"
import { VariantMetricsReader } from "../ports/variant-metrics-reader.ts"

export interface GetExperimentComparisonInput {
  readonly projectId: ProjectId
  readonly slug: string
  /** Anchor for resolving relative time ranges. Defaults to the current time. */
  readonly now?: Date
}

export type GetExperimentComparisonError = NotFoundError | RepositoryError | ValidationError

export const getExperimentComparisonUseCase = (
  input: GetExperimentComparisonInput,
): Effect.Effect<
  ExperimentComparison,
  GetExperimentComparisonError,
  SqlClient | ChSqlClient | ExperimentRepository | VariantMetricsReader
> =>
  Effect.gen(function* () {
    const repository = yield* ExperimentRepository
    const reader = yield* VariantMetricsReader
    const experiment = yield* repository.findBySlug({ projectId: input.projectId, slug: input.slug })
    const now = input.now ?? new Date()

    const resolved = experiment.variants.map((variant) => ({
      variant,
      range: resolveVariantRange(variant.timeRange, now),
    }))

    const computed = yield* Effect.all(
      resolved.map(({ variant, range }) =>
        reader
          .computeVariantMetrics({
            organizationId: experiment.organizationId,
            projectId: experiment.projectId,
            filterSet: variant.filterSet,
            query: variant.query,
            range,
          })
          .pipe(Effect.map((metrics) => ({ variant, range, metrics }))),
      ),
      // Bound the per-comparison query fan-out onto the shared ClickHouse pool: each variant fires up
      // to METRIC_QUERY_CONCURRENCY queries, so this cap keeps total in-flight pool-friendly.
      { concurrency: VARIANT_METRIC_CONCURRENCY },
    )

    const baselineValues = computed.find(({ variant }) => variant.baseline)?.metrics.values ?? null

    const variants: VariantComparison[] = computed.map(({ variant, range, metrics }) => {
      const deltas = Object.fromEntries(
        EXPERIMENT_METRICS.map((metric) => {
          const key = metric.key as ExperimentMetricKey
          const delta = variant.baseline ? null : computeDelta(metrics.values[key], baselineValues?.[key] ?? null)
          return [key, delta]
        }),
      ) as Record<ExperimentMetricKey, MetricDeltaValue | null>

      // Deviation is computed per metric from the raw populations, not the delta: a null delta
      // (baseline is 0) still deviates when the variant has any population, so an empty baseline vs
      // a non-empty variant is flagged symmetrically with the reverse case. Sessions and users
      // deviate independently, so each key is reported on its own.
      const deviatingPopulationKeys = variant.baseline
        ? []
        : DEVIATION_METRIC_KEYS.filter((key) => {
            const variantValue = metrics.values[key]
            const baselineValue = baselineValues?.[key] ?? null
            if (variantValue === null || baselineValue === null) return false
            if (baselineValue === 0) return variantValue !== 0
            return Math.abs((variantValue - baselineValue) / baselineValue) > POPULATION_DEVIATION_THRESHOLD
          })

      return {
        variantId: variant.id,
        baseline: variant.baseline,
        approximate: queryHasSemanticComponent(variant.query),
        resolvedRange: range,
        metrics,
        deltas,
        deviatingPopulationKeys,
      }
    })

    return { experiment, variants }
  })
