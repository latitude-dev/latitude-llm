import { Effect } from "effect"
import { EXPERIMENT_METRICS, type ExperimentMetricKey } from "../constants.ts"
import type { TopListItem, VariantMetrics } from "../entities/variant-metrics.ts"
import type {
  ComputeSummaryMetricsInput,
  ComputeVariantMetricsInput,
  ExperimentSummaryCounts,
  VariantMetricsReaderShape,
} from "../ports/variant-metrics-reader.ts"

type MetricValues = Record<ExperimentMetricKey, number | null>

const zeroedValues = (): MetricValues =>
  Object.fromEntries(EXPERIMENT_METRICS.map((metric) => [metric.key, null])) as MetricValues

export interface FakeVariantMetricsReaderOptions {
  /** Override a subset of metric values per variant; unspecified keys stay `null`. */
  readonly values?: (input: ComputeVariantMetricsInput) => Partial<Record<ExperimentMetricKey, number | null>>
  readonly topTools?: readonly TopListItem[]
  readonly topSignals?: readonly TopListItem[]
  readonly topBehaviours?: readonly TopListItem[]
  readonly summary?: (input: ComputeSummaryMetricsInput) => ExperimentSummaryCounts
}

export const createFakeVariantMetricsReader = (options: FakeVariantMetricsReaderOptions = {}) => {
  const reader: VariantMetricsReaderShape = {
    computeVariantMetrics: (input) =>
      Effect.sync<VariantMetrics>(() => ({
        values: { ...zeroedValues(), ...(options.values?.(input) ?? {}) },
        topTools: options.topTools ?? [],
        topSignals: options.topSignals ?? [],
        topBehaviours: options.topBehaviours ?? [],
      })),
    computeSummaryMetrics: (input) =>
      Effect.sync<ExperimentSummaryCounts>(() => options.summary?.(input) ?? { sessionsDistinct: 0, usersDistinct: 0 }),
  }
  return { reader }
}
