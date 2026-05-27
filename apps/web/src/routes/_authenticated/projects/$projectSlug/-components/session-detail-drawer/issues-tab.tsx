import { Text } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { IssueLifecycleStatuses } from "../../../../../../components/issues/issue-lifecycle-statuses.tsx"
import { useSessionIssues } from "../../../../../../domains/sessions/sessions.collection.ts"
import type { OpenTraceOptions } from "../session-detail-drawer.tsx"

export function IssuesTab({
  projectId,
  traceIds,
  traceNumberById,
  onOpenTrace,
}: {
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly traceNumberById: ReadonlyMap<string, number>
  /** Default target tab is `"trace"` (the Trace overview), per the session panel contract. */
  readonly onOpenTrace: (traceId: string, options?: OpenTraceOptions) => void
}) {
  const { data: issues, isLoading, isError } = useSessionIssues({ projectId, traceIds })

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <Text.H5 color="foregroundMuted">Couldn't load issues — retry.</Text.H5>
      </div>
    )
  }

  if (!issues || issues.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <Text.H5 color="foregroundMuted">No issues detected in this session.</Text.H5>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
      {issues.map((issue) => (
        <div key={issue.id} className="flex flex-col gap-2 rounded-md border px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <Text.H5>{issue.name}</Text.H5>
            <IssueLifecycleStatuses states={issue.states} wrap={false} />
          </div>
          <div className="flex items-center gap-3">
            <Text.H6 color="foregroundMuted">
              {formatCount(issue.occurrences)} occurrence{issue.occurrences === 1 ? "" : "s"}
            </Text.H6>
            <Text.H6 color="foregroundMuted">last seen {relativeTime(new Date(issue.lastSeenAt))}</Text.H6>
          </div>
          {issue.traceIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Text.H6 color="foregroundMuted">Affected:</Text.H6>
              {issue.traceIds.map((traceId) => {
                const traceNumber = traceNumberById.get(traceId)
                return (
                  <button
                    type="button"
                    key={traceId}
                    onClick={() => onOpenTrace(traceId)}
                    className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                  >
                    {traceNumber !== undefined ? `Trace ${traceNumber}` : traceId.slice(0, 8)}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
