import { cn, InfiniteTable, type InfiniteTableColumn, type InfiniteTableInfiniteScroll } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { DatabaseIcon } from "lucide-react"
import type { MemoryStoreMetricsRecord } from "../../../../../../domains/memories/memories.functions.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import type { TableColumnOption } from "../../-components/columns-selector.tsx"
import { formatSignedCount, formatWriteYield } from "./memory-formatters.ts"
import { MemoryTrendBar } from "./memory-trend-bar.tsx"
import { encodeStoreSegment, storeDisplayLabel } from "./store-encoding.ts"

export const MEMORY_STORE_COLUMN_OPTIONS = [
  { id: "store", label: "Store", required: true },
  { id: "trend", label: "Trend" },
  { id: "records", label: "Records" },
  { id: "tokens", label: "Tokens" },
  { id: "reads", label: "Reads" },
  { id: "yield", label: "Write yield" },
  { id: "netGrowth", label: "Net growth" },
  { id: "lastUpdated", label: "Last updated" },
  { id: "lastRead", label: "Last read" },
  { id: "sessions", label: "Sessions", defaultHidden: true },
  { id: "users", label: "Users", defaultHidden: true },
] as const satisfies readonly TableColumnOption[]

export type MemoryStoreColumnId = (typeof MEMORY_STORE_COLUMN_OPTIONS)[number]["id"]

export interface MemoryStoresSorting {
  readonly column: "lastUpdated" | "lastRead" | "records" | "tokens" | "sessions" | "users" | "reads" | "yield" | "netGrowth"
  readonly direction: "asc" | "desc"
}

export const DEFAULT_MEMORY_SORTING: MemoryStoresSorting = { column: "lastUpdated", direction: "desc" }

export function MemoryStoresView({
  stores,
  isLoading,
  sorting,
  onSortChange,
  infiniteScroll,
  projectSlug,
  visibleColumnIds,
  rangeFromIso,
  rangeToIso,
  trendBucketSeconds,
}: {
  readonly stores: readonly MemoryStoreMetricsRecord[]
  readonly isLoading: boolean
  readonly sorting: MemoryStoresSorting
  readonly onSortChange: (sorting: MemoryStoresSorting) => void
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly projectSlug: string
  readonly visibleColumnIds: readonly MemoryStoreColumnId[]
  readonly rangeFromIso: string
  readonly rangeToIso: string
  readonly trendBucketSeconds: number
}) {
  const allColumns: Record<MemoryStoreColumnId, InfiniteTableColumn<MemoryStoreMetricsRecord>> = {
    store: {
      key: "store",
      header: "Store",
      width: 300,
      minWidth: 200,
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
    trend: {
      key: "trend",
      header: "Trend",
      width: 130,
      render: (store) => (
        <MemoryTrendBar
          points={store.trend}
          fromIso={rangeFromIso}
          toIso={rangeToIso}
          bucketSeconds={trendBucketSeconds}
        />
      ),
    },
    records: { key: "records", header: "Records", width: 92, align: "end", sortKey: "records", render: (store) => formatCount(store.recordCount) },
    tokens: { key: "tokens", header: "Tokens", width: 100, align: "end", sortKey: "tokens", render: (store) => formatCount(store.tokenCount) },
    reads: { key: "reads", header: "Reads", width: 92, align: "end", sortKey: "reads", render: (store) => formatCount(store.readSessions) },
    yield: {
      key: "yield",
      header: "Write yield",
      width: 100,
      align: "end",
      sortKey: "yield",
      render: (store) => formatWriteYield(store.consumedVersions, store.completedVersions),
    },
    netGrowth: {
      key: "netGrowth",
      header: "Net growth",
      width: 100,
      align: "end",
      sortKey: "netGrowth",
      render: (store) => formatSignedCount(store.netTokenGrowth),
    },
    lastUpdated: { key: "lastUpdated", header: "Last updated", width: 124, sortKey: "lastUpdated", render: (store) => relativeTime(new Date(store.lastUpdatedAt)) },
    lastRead: { key: "lastRead", header: "Last read", width: 124, sortKey: "lastRead", render: (store) => (store.lastReadAt ? relativeTime(new Date(store.lastReadAt)) : "-") },
    sessions: { key: "sessions", header: "Sessions", width: 92, align: "end", sortKey: "sessions", render: (store) => formatCount(store.sessionCount) },
    users: { key: "users", header: "Users", width: 84, align: "end", sortKey: "users", render: (store) => formatCount(store.userCount) },
  }

  const columns = visibleColumnIds.flatMap((columnId) => {
    const column = allColumns[columnId]
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
