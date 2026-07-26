import { InfiniteTable, type InfiniteTableColumn, type InfiniteTableSorting, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMemo, useState } from "react"
import { getPrimaryLifecycleState } from "../../../../../../components/signals/lifecycle-formatters.ts"
import { SignalLifecycleStatuses } from "../../../../../../components/signals/signal-lifecycle-statuses.tsx"
import { useSessionSignals } from "../../../../../../domains/sessions/sessions.collection.ts"
import type { SessionSignalRecord } from "../../../../../../domains/sessions/sessions.functions.ts"

// Mirrors the standalone issues table's primary-state ordering so "Status" sort
// surfaces the most actionable issues first (regressed → escalating → new → …).
const LIFECYCLE_PRIORITY: readonly string[] = ["regressed", "escalating", "new", "ongoing", "resolved", "ignored"]

const DEFAULT_SORTING: InfiniteTableSorting = {
  column: "lastSeen",
  direction: "desc",
}

function lifecycleRank(states: readonly string[]): number {
  const primary = getPrimaryLifecycleState(states)
  if (!primary) return LIFECYCLE_PRIORITY.length
  const idx = LIFECYCLE_PRIORITY.indexOf(primary)
  return idx === -1 ? LIFECYCLE_PRIORITY.length : idx
}

function compareSignals(a: SessionSignalRecord, b: SessionSignalRecord, sorting: InfiniteTableSorting): number {
  const dir = sorting.direction === "asc" ? 1 : -1
  switch (sorting.column) {
    case "name":
      return dir * a.name.localeCompare(b.name)
    case "state":
      return dir * (lifecycleRank(a.states) - lifecycleRank(b.states))
    case "lastSeen":
      return dir * (Date.parse(a.lastSeenAt) - Date.parse(b.lastSeenAt))
    default:
      return 0
  }
}

export function SignalsTab({
  projectId,
  traceIds,
  onOpenSignal,
}: {
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly onOpenSignal: (signalId: string) => void
}) {
  const { data: issues, isLoading, isError } = useSessionSignals({ projectId, traceIds })
  const [sorting, setSorting] = useState<InfiniteTableSorting>(DEFAULT_SORTING)

  const sortedSignals = useMemo(() => {
    if (!issues) return []
    return [...issues].sort((a, b) => compareSignals(a, b, sorting))
  }, [issues, sorting])

  const columns = useMemo<InfiniteTableColumn<SessionSignalRecord>[]>(
    () => [
      {
        key: "name",
        header: "Signal",
        sortKey: "name",
        minWidth: 200,
        render: (issue) => (
          <Text.H5 noWrap ellipsis>
            {issue.name}
          </Text.H5>
        ),
      },
      {
        key: "status",
        header: "Status",
        sortKey: "state",
        width: 130,
        minWidth: 110,
        render: (issue) => {
          const primaryState = getPrimaryLifecycleState(issue.states)
          return <SignalLifecycleStatuses states={primaryState ? [primaryState] : []} wrap={false} />
        },
      },
      {
        key: "seenAt",
        header: "Seen at",
        sortKey: "lastSeen",
        width: 120,
        minWidth: 100,
        render: (issue) => (
          <Text.H5 color="foregroundMuted" noWrap>
            {relativeTime(new Date(issue.lastSeenAt))}
          </Text.H5>
        ),
      },
    ],
    [],
  )

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <Text.H5 color="foregroundMuted">Couldn't load signals. Please try again.</Text.H5>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-6 px-6">
      <InfiniteTable
        data={sortedSignals}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(issue) => issue.id}
        onRowClick={(issue) => onOpenSignal(issue.id)}
        getRowAriaLabel={(issue) => `Open issue ${issue.name}`}
        sorting={sorting}
        defaultSorting={DEFAULT_SORTING}
        onSortChange={setSorting}
        blankSlate="No signals detected in this session."
      />
    </div>
  )
}
