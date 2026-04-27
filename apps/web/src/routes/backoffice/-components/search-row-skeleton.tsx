import { Skeleton } from "@repo/ui"

/**
 * Pulse-animated row placeholder used while a search request is in flight.
 *
 * Matches the dimensions of `<Row>` exactly so swapping it for real
 * results doesn't shift the layout — same border, same padding, same
 * leading-element size, same two-tier text height. This is what makes
 * the omnibox feel responsive: the structure appears instantly, only
 * the content streams in.
 */
export function SearchRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-background px-4 py-3">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

export function SearchRowSkeletonStack({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton placeholders, never reorder.
        <SearchRowSkeleton key={i} />
      ))}
    </div>
  )
}
