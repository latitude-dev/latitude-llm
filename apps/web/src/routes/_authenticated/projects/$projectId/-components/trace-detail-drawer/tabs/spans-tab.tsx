import { Text } from "@repo/ui"
import { formatPrice } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { useSpansByTraceCollection } from "../../../../../../../domains/spans/spans.collection.ts"

export function SpansTab({ projectId, traceId }: { readonly projectId: string; readonly traceId: string }) {
  const { data: spans } = useSpansByTraceCollection(traceId)
  const sorted = spans?.slice().sort((a, b) => a.startTime.localeCompare(b.startTime))

  if (!sorted) {
    return (
      <div className="flex items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">Loading spans...</Text.H5>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <Text.H5 color="foregroundMuted">No spans found</Text.H5>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 py-2 px-2 overflow-y-auto flex-1">
      {sorted.map((span) => (
        <Link
          key={`${span.traceId}-${span.spanId}`}
          to="/projects/$projectId/traces/$traceId/spans/$spanId"
          params={{ projectId, traceId: span.traceId, spanId: span.spanId }}
          className="flex flex-row items-center gap-3 rounded-md px-3 py-2 hover:bg-muted transition-colors"
        >
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <Text.H5 noWrap ellipsis>
              {span.name}
            </Text.H5>
            <div className="flex flex-row gap-2">
              <Text.H6 color="foregroundMuted">{span.kind.toUpperCase()}</Text.H6>
              <Text.H6 color={span.statusCode === "error" ? "destructive" : "foregroundMuted"}>
                {span.statusCode.toUpperCase()}
              </Text.H6>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            {span.model && <Text.H6 color="foregroundMuted">{span.model}</Text.H6>}
            {span.costTotalMicrocents > 0 && (
              <Text.H6 color="foregroundMuted">{formatPrice(span.costTotalMicrocents / 100_000_000)}</Text.H6>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}
