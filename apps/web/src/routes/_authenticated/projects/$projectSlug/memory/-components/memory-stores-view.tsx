import { cn, InfiniteTable, type InfiniteTableColumn, type InfiniteTableInfiniteScroll } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { Link } from "@tanstack/react-router"
import { DatabaseIcon } from "lucide-react"
import type { MemoryStoreRecord } from "../../../../../../domains/memories/memories.functions.ts"
import {
  ListingLayout as Layout,
  listingLayoutIntrinsicScroll,
} from "../../../../../../layouts/ListingLayout/index.tsx"
import { encodeStoreSegment, storeDisplayLabel } from "./store-encoding.ts"

export interface MemoryStoresSorting {
  readonly column: "lastUpdated" | "lastRead" | "records" | "tokens" | "sessions" | "users"
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
}: {
  readonly stores: readonly MemoryStoreRecord[]
  readonly isLoading: boolean
  readonly sorting: MemoryStoresSorting
  readonly onSortChange: (sorting: MemoryStoresSorting) => void
  readonly infiniteScroll: InfiniteTableInfiniteScroll
  readonly projectSlug: string
}) {
  const columns: InfiniteTableColumn<MemoryStoreRecord>[] = [
    {
      key: "store",
      header: "Store",
      width: 320,
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
      key: "records",
      header: "Records",
      width: 96,
      align: "end",
      sortKey: "records",
      render: (store) => formatCount(store.recordCount),
    },
    {
      key: "tokens",
      header: "Tokens",
      width: 110,
      align: "end",
      sortKey: "tokens",
      render: (store) => formatCount(store.tokenCount),
    },
    {
      key: "lastUpdated",
      header: "Last updated",
      width: 130,
      sortKey: "lastUpdated",
      render: (store) => relativeTime(new Date(store.lastUpdatedAt)),
    },
    {
      key: "lastRead",
      header: "Last read",
      width: 130,
      sortKey: "lastRead",
      render: (store) => (store.lastReadAt ? relativeTime(new Date(store.lastReadAt)) : "-"),
    },
    {
      key: "sessions",
      header: "Sessions",
      width: 96,
      align: "end",
      sortKey: "sessions",
      render: (store) => formatCount(store.sessionCount),
    },
    {
      key: "users",
      header: "Users",
      width: 90,
      align: "end",
      sortKey: "users",
      render: (store) => formatCount(store.userCount),
    },
  ]

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
