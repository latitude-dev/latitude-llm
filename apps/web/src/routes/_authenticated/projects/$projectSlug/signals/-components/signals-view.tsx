import {
  Avatar,
  Icon,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  type InfiniteTableSelection,
  Skeleton,
  TagList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { CircleDashedIcon } from "lucide-react"
import {
  SIGNAL_PRIORITY_META,
  type SignalPriorityGroupId,
} from "../../../../../../components/signals/signal-priority-meta.tsx"
import { useMemberByUserIdMap } from "../../../../../../domains/members/members.collection.ts"
import type { MemberRecord } from "../../../../../../domains/members/members.functions.ts"
import type {
  SignalRecord,
  SignalRowMetricsRecord,
  SignalsListResultRecord,
} from "../../../../../../domains/signals/signals.functions.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import { formatPercent, formatSeenAgeParts, getPrimaryLifecycleState } from "./signal-formatters.ts"
import { SignalLifecycleStatuses } from "./signal-lifecycle-statuses.tsx"
import { SignalTrendBar } from "./signal-trend-bar.tsx"

export const ISSUES_COLUMN_OPTIONS = [
  { id: "issue", label: "Signal", required: true },
  { id: "tags", label: "Tags" },
  { id: "status", label: "Status" },
  { id: "assignee", label: "Assignee" },
  { id: "trend", label: "Trend" },
  { id: "seenAt", label: "Seen at" },
  { id: "occurrences", label: "Occurrences" },
  { id: "affectedTraces", label: "Affected sessions" },
] as const

export type SignalsColumnId = (typeof ISSUES_COLUMN_OPTIONS)[number]["id"]

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

function AnalyticsCellSkeleton() {
  return <Skeleton className="ml-auto h-4 w-10" />
}

function PriorityGroupHeader({ group, count }: { readonly group: SignalPriorityGroupId; readonly count: number }) {
  const meta = SIGNAL_PRIORITY_META[group]
  return (
    // Deliberately NOT a filled band — a full-width rectangle reads as just
    // another row. Instead: an eyebrow-style section heading (icon +
    // uppercase label + count) with a hairline rule filling the remaining
    // width, plus generous top padding to separate it from the group above.
    <div className="flex items-center gap-2 px-3 pt-5 pb-1.5">
      <Icon icon={meta.icon} size="sm" color={meta.iconColor} />
      <Text.H6 weight="semibold" className="uppercase tracking-wide">
        {meta.label}
      </Text.H6>
      <Text.H6 color="foregroundMuted">{formatCount(count)}</Text.H6>
      <div className="h-px min-w-4 flex-1 bg-border" />
    </div>
  )
}

function EvaluatedByTooltip({ evaluationNames }: { readonly evaluationNames: readonly string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Text.H6 color="foregroundMuted">Evaluated by</Text.H6>
      {evaluationNames.map((evaluationName) => (
        <Text.H6B key={evaluationName}>{evaluationName}</Text.H6B>
      ))}
    </div>
  )
}

export interface SignalsTableSorting {
  readonly column: "lastSeen" | "occurrences" | "affectedSessions" | "state"
  readonly direction: "asc" | "desc"
}

export function SignalsView({
  issues,
  rowMetricsBySignalId,
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
  readonly issues: readonly SignalRecord[]
  readonly rowMetricsBySignalId: SignalRowMetricsRecord["metricsBySignalId"]
  readonly isLoading: boolean
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly sorting: SignalsTableSorting
  readonly occurrencesSum: number
  readonly priorityCounts: SignalsListResultRecord["priorityCounts"]
  readonly visibleColumnIds: readonly SignalsColumnId[]
  readonly selection: InfiniteTableSelection
  readonly onSortChange: (sorting: SignalsTableSorting) => void
  readonly projectSlug: string
}) {
  const memberByUserId = useMemberByUserIdMap()

  const allColumns: readonly InfiniteTableColumn<SignalRecord>[] = [
    {
      key: "issue",
      header: "Signal",
      width: 360,
      minWidth: 280,
      render: (issue) => (
        <div className="flex min-w-0 items-center gap-2">
          <Text.H5 className="min-w-0 flex-1" noWrap ellipsis>
            {issue.name}
          </Text.H5>
          {issue.evaluations.length > 0 ? (
            <div className="shrink-0">
              <SignalLifecycleStatuses
                states={[]}
                wrap={false}
                extraStatuses={[
                  {
                    key: "monitored",
                    label: "Evaluated",
                    variant: "success",
                    tooltip: (
                      <EvaluatedByTooltip evaluationNames={issue.evaluations.map((evaluation) => evaluation.name)} />
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
            <SignalLifecycleStatuses states={primaryState ? [primaryState] : []} wrap={false} />
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
      render: (issue) => {
        const metrics = rowMetricsBySignalId[issue.id]
        return (
          <SignalTrendBar
            buckets={metrics?.trend ?? []}
            height={36}
            emptyLabel={metrics ? "-" : ""}
            showLabels={false}
            states={issue.states}
            escalationOccurrenceThreshold={issue.escalationOccurrenceThreshold}
          />
        )
      },
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
      render: (issue) => {
        const metrics = rowMetricsBySignalId[issue.id]
        return metrics ? formatCount(metrics.occurrences) : <AnalyticsCellSkeleton />
      },
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
      header: "Affected sessions",
      width: 76,
      minWidth: 76,
      align: "end",
      sortKey: "affectedSessions",
      render: (issue) => {
        const metrics = rowMetricsBySignalId[issue.id]
        return metrics ? formatPercent(metrics.affectedSessionsPercent) : <AnalyticsCellSkeleton />
      },
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
          selection={selection}
          getRowGroup={(issue) => issue.priority ?? "none"}
          renderGroupHeader={(groupKey) => (
            <PriorityGroupHeader
              group={groupKey as SignalPriorityGroupId}
              count={priorityCounts[groupKey as SignalPriorityGroupId] ?? 0}
            />
          )}
          renderRowLink={(issue, props) => (
            <Link
              to="/projects/$projectSlug/signals/$signalId"
              params={{ projectSlug, signalId: issue.id }}
              aria-label={`Open ${issue.name}`}
              {...props}
            />
          )}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          defaultSorting={{ column: "lastSeen", direction: "desc" }}
          onSortChange={(nextSorting) =>
            onSortChange({
              column: nextSorting.column as SignalsTableSorting["column"],
              direction: nextSorting.direction as SignalsTableSorting["direction"],
            })
          }
          blankSlate="No issues match the current filters"
        />
      </Layout.List>
    </Layout.Body>
  )
}
