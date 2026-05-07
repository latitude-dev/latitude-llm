import type { FilterSet } from "@domain/shared"
import { isTraceHistogramMetric, type TraceHistogramMetric } from "@domain/spans"
import { Button, Icon, Text } from "@repo/ui"
import { BarChart2, ChevronDown } from "lucide-react"
import { useCallback, useState } from "react"
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
  const [collapsed, setCollapsed] = useState(false)

  // The default metric ("traces") is intentionally omitted from the URL by `useParamState` so the
  // canonical link stays clean; only non-default selections make it into the query string.
  const [selectedMetric, setSelectedMetric] = useParamState("histogramMetric", DEFAULT_HISTOGRAM_METRIC, {
    validate: isTraceHistogramMetric,
  })

  const onMetricSelect = useCallback((metric: TraceHistogramMetric) => setSelectedMetric(metric), [setSelectedMetric])

  if (collapsed) {
    return (
      <div className="flex flex-col rounded-lg bg-secondary">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1.5">
            <Icon icon={BarChart2} size="sm" color="foregroundMuted" />
            <Text.H6 color="foregroundMuted">Traces statistics</Text.H6>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} aria-label="Expand statistics">
            <Icon icon={ChevronDown} size="sm" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg bg-secondary">
      <div className="p-2">
        <GeneralAggregations
          projectId={projectId}
          filters={filters}
          selectedMetric={selectedMetric}
          onMetricSelect={onMetricSelect}
          onCollapse={() => setCollapsed(true)}
        />
        <Histogram projectId={projectId} filters={filters} metric={selectedMetric} onRangeSelect={onTimeRangeSelect} />
      </div>
    </div>
  )
}
