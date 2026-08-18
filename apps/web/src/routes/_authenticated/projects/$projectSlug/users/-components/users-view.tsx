import {
  Avatar,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatPrice } from "@repo/utils"
import { Link, useNavigate } from "@tanstack/react-router"
import { type RefObject, useCallback, useMemo, useState } from "react"
import type { ProjectUserRecord } from "../../../../../../domains/end-users/end-users.functions.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { useListRowKeyboardNav } from "../../../../../../lib/hooks/useListRowKeyboardNav.ts"
import { UserActivityBar } from "./user-activity-bar.tsx"
import {
  formatAgeLabel,
  formatAgoLabel,
  formatPercent,
  USER_FAILING_ERROR_RATE,
  userDisplayName,
} from "./user-formatters.ts"

export const USERS_COLUMN_OPTIONS = [
  { id: "user", label: "User", required: true },
  { id: "email", label: "Email" },
  { id: "seenAt", label: "Seen at" },
  { id: "activity", label: "Trend" },
  { id: "sessions", label: "Sessions" },
  { id: "errors", label: "Errors" },
  { id: "tokens", label: "Tokens", defaultHidden: true },
  { id: "cost", label: "Cost" },
] as const

export type UsersColumnId = (typeof USERS_COLUMN_OPTIONS)[number]["id"]

export interface UsersTableSorting {
  readonly column: "lastSeen" | "firstSeen" | "sessions" | "errors" | "tokens" | "cost" | "costAvg" | "costMedian"
  readonly direction: "asc" | "desc"
}

const COST_MODES = ["sum", "avg", "median"] as const
type CostMode = (typeof COST_MODES)[number]

const COST_MODE_META: Record<
  CostMode,
  {
    readonly label: string
    readonly sortField: UsersTableSorting["column"]
    readonly select: (user: ProjectUserRecord) => number
  }
> = {
  sum: { label: "SUM", sortField: "cost", select: (user) => user.costTotalMicrocents },
  avg: { label: "AVG", sortField: "costAvg", select: (user) => user.costAvgMicrocents },
  median: { label: "MED", sortField: "costMedian", select: (user) => user.costMedianMicrocents },
}

/**
 * Pill in the column subheader cycling how the per-user cost is computed.
 * Shows the column-wide aggregate of the displayed values beside the mode
 * label, like the traces table's metric subheader.
 */
function CostModePill({
  mode,
  rollupValue,
  onCycle,
}: {
  readonly mode: CostMode
  readonly rollupValue: number | undefined
  readonly onCycle: () => void
}) {
  return (
    <div className="flex min-w-0 w-full items-center justify-end">
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-xs transition-colors hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation()
          onCycle()
        }}
        aria-label="Change how the cost is computed"
      >
        <span className="shrink-0 font-medium text-muted-foreground tabular-nums">{COST_MODE_META[mode].label}</span>
        <span className="shrink-0 font-semibold text-foreground">
          {rollupValue !== undefined && rollupValue > 0 ? formatPrice(rollupValue / 100_000_000) : "-"}
        </span>
      </button>
    </div>
  )
}

function UserCell({ user }: { readonly user: ProjectUserRecord }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar size="xs" name={userDisplayName(user)} imageSrc={null} />
      <Text.H5 className="min-w-0 flex-1 font-mono" noWrap ellipsis>
        {user.userId}
      </Text.H5>
    </div>
  )
}

function SeenAtCell({ user }: { readonly user: ProjectUserRecord }) {
  return (
    <div className="flex min-w-0 items-center gap-1 whitespace-nowrap">
      <Tooltip asChild trigger={<span className="truncate">{formatAgoLabel(user.lastSeenAt)}</span>}>
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">Last seen in selected period</Text.H6>
          <Text.H6B>{new Date(user.lastSeenAt).toLocaleString()}</Text.H6B>
        </div>
      </Tooltip>
      <span className="text-muted-foreground">/</span>
      <Tooltip asChild trigger={<span className="truncate">{formatAgeLabel(user.firstSeenAt)}</span>}>
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">First seen in selected period</Text.H6>
          <Text.H6B>{new Date(user.firstSeenAt).toLocaleString()}</Text.H6B>
        </div>
      </Tooltip>
    </div>
  )
}

export function UsersView({
  users,
  isLoading,
  infiniteScroll,
  sorting,
  totalCount,
  activityBucketSeconds,
  costRollup,
  visibleColumnIds,
  onSortChange,
  projectSlug,
  focusedUserId,
  onFocusedUserChange,
  keyboardNavEnabled = true,
  scrollContainerRef,
}: {
  readonly users: readonly ProjectUserRecord[]
  readonly isLoading: boolean
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly sorting: UsersTableSorting
  readonly totalCount: number
  readonly activityBucketSeconds: number
  readonly costRollup: { readonly sum: number; readonly avg: number; readonly median: number } | undefined
  readonly visibleColumnIds: readonly UsersColumnId[]
  readonly onSortChange: (sorting: UsersTableSorting) => void
  readonly projectSlug: string
  readonly focusedUserId?: string | undefined
  readonly onFocusedUserChange?: (userId: string | undefined) => void
  readonly keyboardNavEnabled?: boolean
  /**
   * The ancestor scroll container to virtualize against — shared with the
   * analytics panel stacked above it, so the page scrolls as one and the
   * table's header sticks once it reaches the top.
   */
  readonly scrollContainerRef: RefObject<HTMLDivElement | null>
}) {
  const navigate = useNavigate()
  const userIds = useMemo(() => users.map((user) => user.userId), [users])

  const openUser = useCallback(
    (userId: string) => {
      void navigate({ to: "/projects/$projectSlug/users/$userId", params: { projectSlug, userId } })
    },
    [navigate, projectSlug],
  )

  useListRowKeyboardNav({
    rowIds: userIds,
    focusedRowId: focusedUserId,
    onFocusedRowChange: (userId) => onFocusedUserChange?.(userId),
    onOpenRow: openUser,
    enabled: keyboardNavEnabled,
  })
  const [costMode, setCostMode] = useState<CostMode>(() =>
    sorting.column === "costAvg" ? "avg" : sorting.column === "costMedian" ? "median" : "sum",
  )

  // Cycling re-targets an active cost sort so rows keep following what the cells display.
  const cycleCostMode = () => {
    const next = COST_MODES[(COST_MODES.indexOf(costMode) + 1) % COST_MODES.length] as CostMode
    setCostMode(next)
    if (COST_MODES.some((mode) => COST_MODE_META[mode].sortField === sorting.column)) {
      onSortChange({ column: COST_MODE_META[next].sortField, direction: sorting.direction })
    }
  }

  const allColumns: readonly InfiniteTableColumn<ProjectUserRecord>[] = [
    {
      key: "user",
      header: "User",
      width: 280,
      minWidth: 220,
      render: (user) => <UserCell user={user} />,
      renderSubheader: () => (
        <div className="flex min-w-0 w-full items-center gap-0.5">
          <Text.H6 color="foregroundMuted" className="min-w-0 truncate tabular-nums">
            TOTAL
          </Text.H6>
          <Text.H6B color="foreground">{formatCount(totalCount)}</Text.H6B>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      width: 220,
      minWidth: 160,
      render: (user) =>
        user.userEmail ? (
          <Text.H5 className="min-w-0" noWrap ellipsis>
            {user.userEmail}
          </Text.H5>
        ) : (
          <Text.H6 color="foregroundMuted">-</Text.H6>
        ),
    },
    {
      key: "seenAt",
      header: "Seen at",
      width: 114,
      minWidth: 114,
      sortKey: "lastSeen",
      render: (user) => <SeenAtCell user={user} />,
    },
    {
      key: "activity",
      header: "Trend",
      width: 176,
      minWidth: 176,
      render: (user) => <UserActivityBar buckets={user.activity} height={36} bucketSeconds={activityBucketSeconds} />,
    },
    {
      key: "sessions",
      header: "Sessions",
      width: 84,
      minWidth: 76,
      align: "end",
      sortKey: "sessions",
      render: (user) => formatCount(user.sessionCount),
    },
    {
      key: "errors",
      header: "Errors",
      width: 110,
      minWidth: 96,
      align: "end",
      sortKey: "errors",
      render: (user) => {
        const errorRate = user.sessionCount > 0 ? user.errorSessionCount / user.sessionCount : 0
        return (
          <Tooltip
            asChild
            trigger={
              <span
                className={`tabular-nums ${errorRate >= USER_FAILING_ERROR_RATE ? "text-rose-600 dark:text-rose-400" : ""}`}
              >
                {formatPercent(errorRate)} · {formatCount(user.errorSessionCount)}
              </span>
            }
          >
            {formatCount(user.errorSessionCount)} of {formatCount(user.sessionCount)} sessions errored.
          </Tooltip>
        )
      },
    },
    {
      key: "tokens",
      header: "Tokens",
      width: 90,
      minWidth: 80,
      align: "end",
      sortKey: "tokens",
      render: (user) => (user.tokensTotal > 0 ? formatCount(user.tokensTotal) : "-"),
    },
    {
      key: "cost",
      header: "Cost",
      width: 110,
      minWidth: 96,
      align: "end",
      sortKey: COST_MODE_META[costMode].sortField,
      render: (user) => {
        const value = COST_MODE_META[costMode].select(user)
        if (value <= 0) return "-"
        return (
          <Tooltip asChild trigger={<span className="tabular-nums">{formatPrice(value / 100_000_000)}</span>}>
            <div className="flex flex-col gap-0.5">
              <Text.H6B>{formatPrice(user.costTotalMicrocents / 100_000_000)} total</Text.H6B>
              <Text.H6 color="foregroundMuted">
                {formatPrice(user.costAvgMicrocents / 100_000_000)} avg ·{" "}
                {formatPrice(user.costMedianMicrocents / 100_000_000)} median per trace
              </Text.H6>
            </div>
          </Tooltip>
        )
      },
      renderSubheader: () => (
        <CostModePill mode={costMode} rollupValue={costRollup?.[costMode]} onCycle={cycleCostMode} />
      ),
    },
  ]

  const columnsById = new Map(allColumns.map((column) => [column.key, column]))
  const columns = visibleColumnIds.flatMap((columnId) => {
    const column = columnsById.get(columnId)
    return column ? [column] : []
  })

  return (
    <Layout.Body className="flex-none overflow-visible">
      <Layout.List>
        <InfiniteTable
          scrollAreaLayout="external"
          scrollContainerRef={scrollContainerRef}
          data={users}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(user) => user.userId}
          {...(focusedUserId ? { activeRowKey: focusedUserId, activeRowAutoScroll: true } : {})}
          renderRowLink={(user, props) => (
            <Link
              to="/projects/$projectSlug/users/$userId"
              params={{ projectSlug, userId: user.userId }}
              aria-label={`Open user ${userDisplayName(user)}`}
              {...props}
            />
          )}
          infiniteScroll={infiniteScroll}
          sorting={sorting}
          defaultSorting={{ column: "lastSeen", direction: "desc" }}
          onSortChange={(nextSorting) =>
            onSortChange({
              column: nextSorting.column as UsersTableSorting["column"],
              direction: nextSorting.direction as UsersTableSorting["direction"],
            })
          }
          blankSlate="No users match the current filters"
        />
      </Layout.List>
    </Layout.Body>
  )
}
