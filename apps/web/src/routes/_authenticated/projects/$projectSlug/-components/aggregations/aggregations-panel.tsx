import type { FilterSet } from "@domain/shared"
import { GeneralAggregations } from "./general-aggregations.tsx"
import { Histogram } from "./histogram.tsx"

interface TraceAggregationsPanelProps {
  readonly projectId: string
  readonly filters: FilterSet
  /** Called when user selects a time range via brush on the histogram. */
  readonly onTimeRangeSelect?: (range: { from: string; to: string } | null) => void
}

export function TraceAggregationsPanel({ projectId, filters, onTimeRangeSelect }: TraceAggregationsPanelProps) {
  return (
    <div className="flex flex-col rounded-lg bg-secondary p-2">
      <GeneralAggregations projectId={projectId} filters={filters} />
      <Histogram projectId={projectId} filters={filters} onRangeSelect={onTimeRangeSelect} />
    </div>
  )
}
