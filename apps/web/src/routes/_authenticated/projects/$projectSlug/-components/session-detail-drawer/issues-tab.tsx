import { InfiniteTable, type InfiniteTableColumn, type InfiniteTableSorting, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMemo, useState } from "react"
import { IssueLifecycleStatuses } from "../../../../../../components/issues/issue-lifecycle-statuses.tsx"
import { getPrimaryLifecycleState } from "../../../../../../components/issues/lifecycle-formatters.ts"
import { useSessionIssues } from "../../../../../../domains/sessions/sessions.collection.ts"
import type { SessionIssueRecord } from "../../../../../../domains/sessions/sessions.functions.ts"

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

function compareIssues(a: SessionIssueRecord, b: SessionIssueRecord, sorting: InfiniteTableSorting): number {
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

export function IssuesTab({
  projectId,
  traceIds,
  onOpenIssue,
}: {
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly onOpenIssue: (issueId: string) => void
}) {
  const { data: issues, isLoading, isError } = useSessionIssues({ projectId, traceIds })
  const [sorting, setSorting] = useState<InfiniteTableSorting>(DEFAULT_SORTING)

  const sortedIssues = useMemo(() => {
    if (!issues) return []
    return [...issues].sort((a, b) => compareIssues(a, b, sorting))
  }, [issues, sorting])

  const columns = useMemo<InfiniteTableColumn<SessionIssueRecord>[]>(
    () => [
      {
        key: "name",
        header: "Issue",
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
          return <IssueLifecycleStatuses states={primaryState ? [primaryState] : []} wrap={false} />
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
        <Text.H5 color="foregroundMuted">Couldn't load issues — retry.</Text.H5>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-6 px-6">
      <InfiniteTable
        data={sortedIssues}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(issue) => issue.id}
        onRowClick={(issue) => onOpenIssue(issue.id)}
        getRowAriaLabel={(issue) => `Open issue ${issue.name}`}
        sorting={sorting}
        defaultSorting={DEFAULT_SORTING}
        onSortChange={setSorting}
        blankSlate="No issues detected in this session."
      />
    </div>
  )
}
