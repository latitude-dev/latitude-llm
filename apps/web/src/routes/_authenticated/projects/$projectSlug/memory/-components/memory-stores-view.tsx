import { cn, InfiniteTable, type InfiniteTableColumn, type InfiniteTableInfiniteScroll, Tooltip } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { DatabaseIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { MemoryStoreMetricsRecord } from "../../../../../../domains/memories/memories.functions.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import type { TableColumnOption } from "../../-components/columns-selector.tsx"
import { formatPercent, formatRatio, formatSignedCount } from "./memory-formatters.ts"
import { MemoryTrendBar } from "./memory-trend-bar.tsx"
import { encodeStoreSegment, storeDisplayLabel } from "./store-encoding.ts"

export const MEMORY_COLUMN_OPTIONS = [
  { id: "store", label: "Store", required: true },
  { id: "trend", label: "Trend" },
  { id: "records", label: "Records" },
  { id: "writes", label: "Writes" },
  { id: "reads", label: "Reads" },
  { id: "ratio", label: "Read:write" },
  { id: "dead", label: "Dead %" },
  { id: "zeroHit", label: "Zero-hit %" },
  { id: "lastActivity", label: "Last activity" },
  { id: "churn", label: "Churn", defaultHidden: true },
  { id: "netGrowth", label: "Net growth", defaultHidden: true },
  { id: "tokens", label: "Live tokens", defaultHidden: true },
  { id: "sessions", label: "Sessions", defaultHidden: true },
  { id: "users", label: "Users", defaultHidden: true },
] as const satisfies readonly TableColumnOption[]

export type MemoryColumnId = (typeof MEMORY_COLUMN_OPTIONS)[number]["id"]

export interface MemoryStoresSorting {
  readonly column:
    | "records"
    | "tokens"
    | "sessions"
    | "users"
    | "writes"
    | "reads"
    | "ratio"
    | "dead"
    | "zeroHit"
    | "churn"
    | "lastActivity"
  readonly direction: "asc" | "desc"
}

export const DEFAULT_MEMORY_SORTING: MemoryStoresSorting = { column: "lastActivity", direction: "desc" }

const endValue = (child: ReactNode) => <span className="tabular-nums">{child}</span>

export function MemoryStoresView({
  stores,
  isLoading,
  sorting,
  visibleColumnIds,
  onSortChange,
  infiniteScroll,
  projectSlug,
  rangeFromIso,
  rangeToIso,
  trendBucketSeconds,
}: {
  readonly stores: readonly MemoryStoreMetricsRecord[]
  readonly isLoading: boolean
  readonly sorting: MemoryStoresSorting
  readonly visibleColumnIds: readonly MemoryColumnId[]
  readonly onSortChange: (sorting: MemoryStoresSorting) => void
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly projectSlug: string
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly trendBucketSeconds: number
}) {
  const allColumns: readonly InfiniteTableColumn<MemoryStoreMetricsRecord>[] = [
    {
      key: "store",
      header: "Store",
      width: 300,
      minWidth: 220,
      render: (store) => (
        <div className="flex min-w-0 items-center gap-2">
          <DatabaseIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-mono text-[13px]",
              store.storeId === "" && "italic text-muted-foreground",
            )}
            title={storeDisplayLabel(store.storeId)}
          >
            {storeDisplayLabel(store.storeId)}
          </span>
        </div>
      ),
    },
    {
      key: "trend",
      header: "Trend",
      width: 176,
      minWidth: 140,
      render: (store) => (
        // The sparkline's positioned spans paint above the row's stretched link
        // and would swallow clicks — wrap it in its own link so clicking the
        // trend also opens the store.
        <Link
          to="/projects/$projectSlug/memory/$store"
          params={{ projectSlug, store: encodeStoreSegment(store.storeId) }}
          className="block"
          tabIndex={-1}
          aria-hidden
        >
          <MemoryTrendBar
            buckets={store.trend}
            fromIso={rangeFromIso}
            toIso={rangeToIso}
            bucketSeconds={trendBucketSeconds}
            height={36}
          />
        </Link>
      ),
    },
    {
      key: "records",
      header: "Records",
      width: 92,
      minWidth: 80,
      align: "end",
      sortKey: "records",
      render: (store) => endValue(formatCount(store.liveRecords)),
    },
    {
      key: "writes",
      header: "Writes",
      width: 90,
      minWidth: 80,
      align: "end",
      sortKey: "writes",
      render: (store) => endValue(formatCount(store.writes)),
    },
    {
      key: "reads",
      header: "Reads",
      width: 90,
      minWidth: 80,
      align: "end",
      sortKey: "reads",
      render: (store) => (
        <Tooltip asChild trigger={endValue(formatCount(store.reads))}>
          {formatCount(store.reads)} records retrieved across {formatCount(store.searches)} searches in this window.
        </Tooltip>
      ),
    },
    {
      key: "ratio",
      header: "Read:write",
      width: 100,
      minWidth: 90,
      align: "end",
      sortKey: "ratio",
      render: (store) => (
        <Tooltip asChild trigger={endValue(formatRatio(store.reads, store.writes))}>
          {formatCount(store.reads)} reads per {formatCount(store.writes)} writes — how much this store is used versus
          maintained.
        </Tooltip>
      ),
    },
    {
      key: "dead",
      header: "Dead %",
      width: 92,
      minWidth: 80,
      align: "end",
      sortKey: "dead",
      render: (store) =>
        store.liveRecords > 0 ? (
          <Tooltip asChild trigger={endValue(formatPercent(store.deadRecords / store.liveRecords))}>
            {formatCount(store.deadRecords)} of {formatCount(store.liveRecords)} live records have never been read.
          </Tooltip>
        ) : (
          endValue("-")
        ),
    },
    {
      key: "zeroHit",
      header: "Zero-hit %",
      width: 96,
      minWidth: 84,
      align: "end",
      sortKey: "zeroHit",
      render: (store) =>
        store.searches > 0 ? (
          <Tooltip asChild trigger={endValue(formatPercent(store.zeroHitSearches / store.searches))}>
            {formatCount(store.zeroHitSearches)} of {formatCount(store.searches)} searches returned nothing.
          </Tooltip>
        ) : (
          endValue("-")
        ),
    },
    {
      key: "lastActivity",
      header: "Last activity",
      width: 120,
      minWidth: 100,
      sortKey: "lastActivity",
      render: (store) => (store.lastActivityAt ? relativeTime(new Date(store.lastActivityAt)) : "-"),
    },
    {
      key: "churn",
      header: "Churn",
      width: 90,
      minWidth: 80,
      align: "end",
      sortKey: "churn",
      render: (store) =>
        store.recordsTouched > 0 ? (
          <Tooltip
            asChild
            trigger={endValue(`${(store.updateEvents / store.recordsTouched).toFixed(1).replace(/\.0$/, "")}×`)}
          >
            {formatCount(store.updateEvents)} updates across {formatCount(store.recordsTouched)} records touched — how
            often records are rewritten.
          </Tooltip>
        ) : (
          endValue("-")
        ),
    },
    {
      key: "netGrowth",
      header: "Net growth",
      width: 100,
      minWidth: 90,
      align: "end",
      render: (store) => (
        <Tooltip
          asChild
          trigger={
            <span
              className={cn(
                "tabular-nums",
                store.netGrowthTokens > 0 && "text-emerald-600 dark:text-emerald-400",
                store.netGrowthTokens < 0 && "text-rose-600 dark:text-rose-400",
              )}
            >
              {formatSignedCount(store.netGrowthTokens)}
            </span>
          }
        >
          Live tokens gained or lost over this window.
        </Tooltip>
      ),
    },
    {
      key: "tokens",
      header: "Live tokens",
      width: 100,
      minWidth: 90,
      align: "end",
      sortKey: "tokens",
      render: (store) => endValue(formatCount(store.liveTokens)),
    },
    {
      key: "sessions",
      header: "Sessions",
      width: 92,
      minWidth: 80,
      align: "end",
      sortKey: "sessions",
      render: (store) => endValue(formatCount(store.sessionCount)),
    },
    {
      key: "users",
      header: "Users",
      width: 84,
      minWidth: 72,
      align: "end",
      sortKey: "users",
      render: (store) => endValue(formatCount(store.userCount)),
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
          data={stores}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(store) => store.storeId}
          sorting={sorting}
          defaultSorting={DEFAULT_MEMORY_SORTING}
          onSortChange={(next) =>
            onSortChange({
              column: next.column as MemoryStoresSorting["column"],
              direction: next.direction as MemoryStoresSorting["direction"],
            })
          }
          infiniteScroll={infiniteScroll}
          renderRowLink={(store, props) => (
            <Link
              to="/projects/$projectSlug/memory/$store"
              params={{ projectSlug, store: encodeStoreSegment(store.storeId) }}
              aria-label={`Open store ${storeDisplayLabel(store.storeId)}`}
              {...props}
            />
          )}
          blankSlate="No memory stores match."
        />
      </Layout.List>
    </Layout.Body>
  )
}
