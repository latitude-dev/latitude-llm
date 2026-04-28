import type { FilterSet } from "@domain/shared"
import { isTraceHistogramMetric, type TraceHistogramMetric } from "@domain/spans"
import { useCallback } from "react"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { GeneralAggregations } from "./general-aggregations.tsx"
import { Histogram } from "./histogram.tsx"

const DEFAULT_HISTOGRAM_METRIC: TraceHistogramMetric = "traces"

interface TraceAggregationsPanelProps {
  readonly projectId: string
  readonly filters: FilterSet
  /** Called when user selects a time range via brush on the histogram. */
  readonly onTimeRangeSelect?: (range: { from: string; to: string } | null) => void
}

export function TraceAggregationsPanel({ projectId, filters, onTimeRangeSelect }: TraceAggregationsPanelProps) {
  // The default metric ("traces") is intentionally omitted from the URL by `useParamState` so the
  // canonical link stays clean; only non-default selections make it into the query string.
  const [selectedMetric, setSelectedMetric] = useParamState("histogramMetric", DEFAULT_HISTOGRAM_METRIC, {
    validate: isTraceHistogramMetric,
  })

  const onMetricSelect = useCallback(
    (metric: TraceHistogramMetric) => {
      setSelectedMetric(metric)
    },
    [setSelectedMetric],
  )

  return (
    <div className="flex flex-col rounded-lg bg-secondary p-2">
      <GeneralAggregations
        projectId={projectId}
        filters={filters}
        selectedMetric={selectedMetric}
        onMetricSelect={onMetricSelect}
      />
      <Histogram projectId={projectId} filters={filters} metric={selectedMetric} onRangeSelect={onTimeRangeSelect} />
    </div>
  )
}
