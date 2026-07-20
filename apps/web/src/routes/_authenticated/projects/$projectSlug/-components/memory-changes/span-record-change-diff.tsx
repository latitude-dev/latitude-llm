import { Skeleton } from "@repo/ui"
import type { ReactNode } from "react"
import { useMemoryRecordChangeDiff } from "../../../../../../domains/memories/memories.collection.ts"
import { MemoryRecordDiff } from "./memory-record-diff.tsx"

/**
 * One span's change to a record, diffed against its prior recorded snapshot (from
 * the ledger). Renders `fallback` while the change is not yet materialized,
 * unresolved, or degraded — the "after" body already lives on the span, so the
 * caller passes the full-content view as the fallback and the pane is never empty.
 */
export function SpanRecordChangeDiff({
  projectId,
  spanId,
  storeId,
  recordId,
  fallback,
}: {
  readonly projectId: string
  readonly spanId: string
  readonly storeId: string
  readonly recordId: string
  readonly fallback: ReactNode
}) {
  const { data, isLoading, isError } = useMemoryRecordChangeDiff({ projectId, storeId, recordId, spanId })

  if (isLoading) {
    return (
      <div className="h-full p-3">
        <Skeleton className="h-full w-full" />
      </div>
    )
  }
  if (isError || data == null) return fallback

  return (
    <MemoryRecordDiff before={data.beforeBody} after={data.afterBody} degraded={data.degraded} fallback={fallback} />
  )
}
