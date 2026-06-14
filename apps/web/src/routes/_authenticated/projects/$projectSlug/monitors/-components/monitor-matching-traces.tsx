import type { MonitorTarget } from "@domain/monitors"
import { Button, Icon, Skeleton, Status, Text } from "@repo/ui"
import { formatDuration, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon } from "lucide-react"
import { useMemo } from "react"
import { targetToTraceFilters } from "../../../../../../domains/monitors/monitor-target.ts"
import { useTracesInfiniteScroll } from "../../../../../../domains/traces/traces.collection.ts"

const PREVIEW_LIMIT = 8
const TRACE_SORTING = { column: "startTime", direction: "desc" } as const

/** A preview of recent traces matching the monitor's target, with a deep link to the full filtered traces view. */
export function MonitorMatchingTraces({
  projectSlug,
  projectId,
  target,
}: {
  readonly projectSlug: string
  readonly projectId: string
  readonly target: MonitorTarget
}) {
  const { filters, query } = useMemo(() => targetToTraceFilters(target), [target])
  const { data, isLoading } = useTracesInfiniteScroll({
    projectId,
    sorting: TRACE_SORTING,
    filters,
    ...(query ? { searchQuery: query } : {}),
  })
  const rows = data.slice(0, PREVIEW_LIMIT)

  const viewAllSearch = {
    filters: JSON.stringify(filters),
    filtersOpen: true,
    ...(query ? { query } : {}),
  }

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg bg-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">Matching traces</Text.H6>
        <Button asChild variant="ghost" size="sm" className="w-auto">
          <Link to="/projects/$projectSlug" params={{ projectSlug }} search={viewAllSearch}>
            View all
            <Icon icon={ArrowUpRightIcon} size="sm" />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Text.H6 color="foregroundMuted">No matching traces in the recent window.</Text.H6>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {rows.map((trace) => (
            <Link
              key={trace.traceId}
              to="/projects/$projectSlug"
              params={{ projectSlug }}
              search={{ traceId: trace.traceId }}
              className="flex min-w-0 items-center justify-between gap-3 py-2 hover:opacity-80"
            >
              <div className="flex min-w-0 items-center gap-2">
                {trace.errorCount > 0 ? (
                  <Status variant="destructive" label="error" />
                ) : (
                  <Status variant="success" label="ok" />
                )}
                <Text.H5 noWrap ellipsis>
                  {trace.rootSpanName || trace.traceId}
                </Text.H5>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Text.H6 color="foregroundMuted" noWrap>
                  {formatDuration(trace.durationNs)}
                </Text.H6>
                <Text.H6 color="foregroundMuted" noWrap>
                  {relativeTime(new Date(trace.startTime))}
                </Text.H6>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
