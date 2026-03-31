import type { FilterSet } from "@domain/shared"
import { GeneralAggregations } from "./general-aggregations.tsx"
import { Histogram } from "./histogram.tsx"

export function TraceAggregationsPanel({
  projectId,
  filters,
}: {
  readonly projectId: string
  readonly filters: FilterSet
}) {
  return (
    <div className="flex flex-col rounded-lg bg-secondary p-2">
      <GeneralAggregations projectId={projectId} filters={filters} />
      <Histogram projectId={projectId} filters={filters} />
    </div>
  )
}
