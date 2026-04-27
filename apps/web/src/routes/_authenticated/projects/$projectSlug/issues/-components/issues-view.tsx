import {
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  type InfiniteTableSelection,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount } from "@repo/utils"
import { useHotkeys } from "@tanstack/react-hotkeys"
import type { RefObject } from "react"
import type { IssueRecord } from "../../../../../../domains/issues/issues.functions.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import { formatPercent, formatSeenAgeParts, getPrimaryLifecycleState } from "./issue-formatters.ts"
import { IssueLifecycleStatuses } from "./issue-lifecycle-statuses.tsx"
import { IssueTrendBar } from "./issue-trend-bar.tsx"

export const ISSUES_COLUMN_OPTIONS = [
  { id: "issue", label: "Issue", required: true },
  { id: "status", label: "Status" },
  { id: "trend", label: "Trend" },
  { id: "seenAt", label: "Seen at" },
  { id: "occurrences", label: "Occurrences" },
  { id: "affectedTraces", label: "Affected traces" },
] as const

export type IssuesColumnId = (typeof ISSUES_COLUMN_OPTIONS)[number]["id"]

function SeenAtCell({
  lastSeenAtIso,
  firstSeenAtIso,
}: {
  readonly lastSeenAtIso: string
  readonly firstSeenAtIso: string
}) {
  const { lastSeenLabel, firstSeenLabel } = formatSeenAgeParts(lastSeenAtIso, firstSeenAtIso)

  return (
    <div className="flex min-w-0 items-center gap-1 whitespace-nowrap">
      <Tooltip asChild trigger={<span className="truncate">{lastSeenLabel}</span>}>
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">Last seen at</Text.H6>
          <Text.H6B>{new Date(lastSeenAtIso).toLocaleString()}</Text.H6B>
        </div>
      </Tooltip>
      <span className="text-muted-foreground">/</span>
      <Tooltip asChild trigger={<span className="truncate">{firstSeenLabel}</span>}>
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">First seen at</Text.H6>
          <Text.H6B>{new Date(firstSeenAtIso).toLocaleString()}</Text.H6B>
        </div>
      </Tooltip>
    </div>
  )
}

function MonitoredByTooltip({ evaluationNames }: { readonly evaluationNames: readonly string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">Monitored by</Text.H6>
      {evaluationNames.map((evaluationName) => (
        <Text.H6B key={evaluationName}>{evaluationName}</Text.H6B>
      ))}
    </div>
  )
}

function AutoMonitoredTooltip() {
  return (
    <div className="flex flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">This issue is automatically monitored on every trace</Text.H6>
    </div>
  )
}

export interface IssuesTableSorting {
  readonly column: "lastSeen" | "occurrences" | "state"
  readonly direction: "asc" | "desc"
}

export function IssuesView({
  issues,
  isLoading,
  infiniteScroll,
  sorting,
  occurrencesSum,
  visibleColumnIds,
  activeIssueId,
  selection,
  onSortChange,
  onActiveIssueChange,
  issueIdsRef,
}: {
  readonly issues: readonly IssueRecord[]
  readonly isLoading: boolean
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly sorting: IssuesTableSorting
  readonly occurrencesSum: number
  readonly visibleColumnIds: readonly IssuesColumnId[]
  readonly activeIssueId: string | undefined
  readonly selection: InfiniteTableSelection
  readonly onSortChange: (sorting: IssuesTableSorting) => void
  readonly onActiveIssueChange: (issueId: string | undefined) => void
  readonly issueIdsRef: RefObject<string[]>
}) {
  const issueIds = issues.map((issue) => issue.id)
  issueIdsRef.current = issueIds

  useHotkeys([
    {
      hotkey: "J",
      callback: () => {
        const currentIndex = activeIssueId ? issueIds.indexOf(activeIssueId) : -1
        const nextIssueId = issueIds[currentIndex + 1]
        if (nextIssueId) {
          onActiveIssueChange(nextIssueId)
        } else if (!activeIssueId && issueIds[0]) {
          onActiveIssueChange(issueIds[0])
        }
      },
    },
    {
      hotkey: "K",
      callback: () => {
        const currentIndex = activeIssueId ? issueIds.indexOf(activeIssueId) : issueIds.length
        const previousIssueId = issueIds[currentIndex - 1]
        if (previousIssueId) {
          onActiveIssueChange(previousIssueId)
        }
      },
    },
  ])

  const allColumns: readonly InfiniteTableColumn<IssueRecord>[] = [
    {
      key: "issue",
      header: "Issue",
      width: 360,
      minWidth: 280,
      render: (issue) => (
        <div className="flex min-w-0 items-center gap-2">
          <Text.H5 className="min-w-0 flex-1" noWrap ellipsis>
            {issue.name}
          </Text.H5>
          {issue.source === "flagger" || issue.evaluations.length > 0 ? (
            <div className="shrink-0">
              <IssueLifecycleStatuses
                states={[]}
                wrap={false}
                extraStatuses={[
                  {
                    key: "monitored",
                    label: "Monitored",
                    variant: "success",
                    tooltip:
                      issue.source === "flagger" ? (
                        <AutoMonitoredTooltip />
                      ) : (
                        <MonitoredByTooltip evaluationNames={issue.evaluations.map((evaluation) => evaluation.name)} />
                      ),
                  },
                ]}
              />
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 104,
      minWidth: 104,
      sortKey: "state",
      render: (issue) => {
        const primaryState = getPrimaryLifecycleState(issue.states)
        return (
          <div className="flex min-w-0 items-center">
            <IssueLifecycleStatuses states={primaryState ? [primaryState] : []} wrap={false} />
          </div>
        )
      },
    },
    {
      key: "trend",
      header: "Trend",
      width: 176,
      minWidth: 176,
      render: (issue) => (
        <IssueTrendBar
          buckets={issue.trend}
          height={36}
          emptyLabel="-"
          showLabels={false}
          states={issue.states}
          resolvedAt={issue.resolvedAt}
          escalationOccurrenceThreshold={issue.escalationOccurrenceThreshold}
          showEscalationThresholdGuide
        />
      ),
      renderSubheader: () => (
        <div className="flex min-w-0 w-full items-center gap-0.5">
          <Text.H6 color="foregroundMuted" className="min-w-0 truncate tabular-nums">
            RANGE
          </Text.H6>
          <Text.H6B color="foreground">14d</Text.H6B>
        </div>
      ),
    },
    {
      key: "seenAt",
      header: "Seen at",
      width: 114,
      minWidth: 114,
      sortKey: "lastSeen",
      render: (issue) => <SeenAtCell lastSeenAtIso={issue.lastSeenAt} firstSeenAtIso={issue.firstSeenAt} />,
    },
    {
      key: "occurrences",
      header: "Occurrences",
      width: 76,
      minWidth: 76,
      align: "end",
      sortKey: "occurrences",
      render: (issue) => formatCount(issue.occurrences),
      renderSubheader: () => (
        <div className="flex min-w-0 w-full items-center justify-end gap-0.5">
          <Text.H6 color="foregroundMuted" className="min-w-0 truncate text-center tabular-nums">
            SUM
          </Text.H6>
          <Text.H6B color="foreground">{formatCount(occurrencesSum)}</Text.H6B>
        </div>
      ),
    },
    {
      key: "affectedTraces",
      header: "Affected traces",
      width: 76,
      minWidth: 76,
      align: "end",
      // Affected traces % is `occurrences / totalTraces` with a constant
      // denominator across the page, so sorting by either column is the same
      // operation. Sharing the sort key lets clicks on either header drive the
      // same sort and lights up the indicator on both at once.
      sortKey: "occurrences",
      render: (issue) => formatPercent(issue.affectedTracesPercent),
    },
  ]

  const columns = allColumns.filter((column) => visibleColumnIds.includes(column.key as IssuesColumnId))

  return (
    <Layout.Body>
      <Layout.List>
        <InfiniteTable
          {...listingLayoutIntrinsicScroll.infiniteTable}
          data={issues}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(issue) => issue.id}
          getRowClassName={(issue, context) =>
            issue.states.includes("regressed") && !context.isActive
              ? "bg-rose-500/7 hover:bg-rose-500/10 dark:bg-rose-500/15 dark:hover:bg-rose-500/19"
              : undefined
          }
          {...(activeIssueId ? { activeRowKey: activeIssueId } : {})}
          selection={selection}
          onRowClick={(issue) => onActiveIssueChange(issue.id === activeIssueId ? undefined : issue.id)}
          getRowAriaLabel={(issue) => (issue.id === activeIssueId ? `Close ${issue.name}` : `Open ${issue.name}`)}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          defaultSorting={{ column: "lastSeen", direction: "desc" }}
          onSortChange={(nextSorting) =>
            onSortChange({
              column: nextSorting.column as IssuesTableSorting["column"],
              direction: nextSorting.direction as IssuesTableSorting["direction"],
            })
          }
          blankSlate="No issues match the current filters"
        />
      </Layout.List>
    </Layout.Body>
  )
}
