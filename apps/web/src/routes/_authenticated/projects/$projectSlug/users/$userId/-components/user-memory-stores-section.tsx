import { cn, Skeleton, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { DatabaseIcon } from "lucide-react"
import { useUserMemoryStores } from "../../../../../../../domains/memories/memories.collection.ts"
import { encodeStoreSegment, storeDisplayLabel } from "../../../memory/-components/store-encoding.ts"
import { formatAgoLabel } from "../../-components/user-formatters.ts"

export function UserMemoryStoresSection({
  projectId,
  projectSlug,
  userId,
}: {
  readonly projectId: string
  readonly projectSlug: string
  readonly userId: string
}) {
  const { data: stores, isLoading } = useUserMemoryStores({ projectId, userId })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (!stores || stores.length === 0) {
    return (
      <div className="flex min-h-16 items-center">
        <Text.H6 color="foregroundMuted">No memory stores accessed by this user yet.</Text.H6>
      </div>
    )
  }

  return (
    <div className="-mx-2 flex max-h-[min(24rem,45vh)] flex-col overflow-y-auto px-2">
      {stores.map((store) => (
        <Link
          key={store.storeId}
          to="/projects/$projectSlug/memory/$store"
          params={{ projectSlug, store: encodeStoreSegment(store.storeId) }}
          aria-label={`Open store ${storeDisplayLabel(store.storeId)}`}
          className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-background"
        >
          <DatabaseIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Text.H5
            className={cn("min-w-0 flex-1 font-mono", store.storeId === "" && "font-sans italic text-muted-foreground")}
            noWrap
            ellipsis
          >
            {storeDisplayLabel(store.storeId)}
          </Text.H5>
          <div className="flex w-16 shrink-0 justify-end">
            <Text.H6 color="foregroundMuted" noWrap>
              {formatAgoLabel(store.lastAccessedAt)}
            </Text.H6>
          </div>
        </Link>
      ))}
    </div>
  )
}
