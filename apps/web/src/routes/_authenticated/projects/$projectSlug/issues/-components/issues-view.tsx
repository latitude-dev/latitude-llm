import {
  Avatar,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  type InfiniteTableSelection,
  TagList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { CircleDashedIcon } from "lucide-react"
import {
  ISSUE_PRIORITY_META,
  type IssuePriorityGroupId,
} from "../../../../../../components/issues/issue-priority-meta.tsx"
import type { IssueRecord, IssuesListResultRecord } from "../../../../../../domains/issues/issues.functions.ts"
import { useMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import type { MemberRecord } from "../../../../../../domains/members/members.functions.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import { formatPercent, formatSeenAgeParts, getPrimaryLifecycleState } from "./issue-formatters.ts"
import { IssueLifecycleStatuses } from "./issue-lifecycle-statuses.tsx"
import { IssueTrendBar } from "./issue-trend-bar.tsx"

export const ISSUES_COLUMN_OPTIONS = [
  { id: "issue", label: "Issue", required: true },
  { id: "tags", label: "Tags" },
  { id: "status", label: "Status" },
  { id: "assignee", label: "Assignee" },
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

function AssigneeCell({
  assigneeId,
  member,
}: {
  readonly assigneeId: string | null
  readonly member: MemberRecord | undefined
}) {
  if (!assigneeId) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon icon={CircleDashedIcon} size="sm" color="foregroundMuted" />
        <Text.H6 color="foregroundMuted" noWrap ellipsis>
          Unassigned
        </Text.H6>
      </div>
    )
  }

  // Hydrated client-side from the members collection; a missing row means the
  // member left the organization after being assigned.
  const displayName = member?.name?.trim() && member.name.trim().length > 0 ? member.name.trim() : member?.email
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Avatar size="xs" name={displayName ?? "?"} imageSrc={member?.image ?? null} />
      <Text.H5 className="min-w-0" noWrap ellipsis>
        {displayName ?? "Former member"}
      </Text.H5>
    </div>
  )
}

function PriorityGroupHeader({ group, count }: { readonly group: IssuePriorityGroupId; readonly count: number }) {
  const meta = ISSUE_PRIORITY_META[group]
  return (
    // Top padding separates each group from the rows above it; `bg-muted`
    // (not `bg-secondary`) so the band reads darker than the row background
    // in both themes.
    <div className="pt-3">
      <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
        <Icon icon={meta.icon} size="sm" color={meta.iconColor} />
        <Text.H6 weight="semibold">{meta.label}</Text.H6>
        <Text.H6 color="foregroundMuted">{formatCount(count)}</Text.H6>
      </div>
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
  priorityCounts,
  visibleColumnIds,
  selection,
  onSortChange,
  projectSlug,
}: {
  readonly issues: readonly IssueRecord[]
  readonly isLoading: boolean
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly sorting: IssuesTableSorting
  readonly occurrencesSum: number
  readonly priorityCounts: IssuesListResultRecord["priorityCounts"]
  readonly visibleColumnIds: readonly IssuesColumnId[]
  readonly selection: InfiniteTableSelection
  readonly onSortChange: (sorting: IssuesTableSorting) => void
  readonly projectSlug: string
}) {
  const memberByUserId = useMemberByUserIdMap()

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
          {issue.evaluations.length > 0 ? (
            <div className="shrink-0">
              <IssueLifecycleStatuses
                states={[]}
                wrap={false}
                extraStatuses={[
                  {
                    key: "monitored",
                    label: "Monitored",
                    variant: "success",
                    tooltip: (
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
      width: 110,
      minWidth: 110,
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
      key: "tags",
      header: "Tags",
      width: 150,
      render: (issue) => <TagList tags={issue.tags} />,
    },
    {
      key: "assignee",
      header: "Assignee",
      width: 140,
      minWidth: 110,
      render: (issue) => (
        <AssigneeCell
          assigneeId={issue.assigneeId}
          member={issue.assigneeId ? memberByUserId.get(issue.assigneeId) : undefined}
        />
      ),
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

  const columnsById = new Map(allColumns.map((column) => [column.key, column]))
  const columns = visibleColumnIds.flatMap((columnId) => {
    const column = columnsById.get(columnId)
    return column ? [column] : []
  })

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
          selection={selection}
          getRowGroup={(issue) => issue.priority ?? "none"}
          renderGroupHeader={(groupKey) => (
            <PriorityGroupHeader
              group={groupKey as IssuePriorityGroupId}
              count={priorityCounts[groupKey as IssuePriorityGroupId] ?? 0}
            />
          )}
          renderRowLink={(issue, props) => (
            <Link
              to="/projects/$projectSlug/issues/$issueId"
              params={{ projectSlug, issueId: issue.id }}
              aria-label={`Open ${issue.name}`}
              {...props}
            />
          )}
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
