import { Text } from "@repo/ui"
import { Link, useParams } from "@tanstack/react-router"
import { ArrowUpRightIcon } from "lucide-react"
import { encodeRecordParam, encodeStoreSegment, recordDisplayLabel } from "../../memory/-components/store-encoding.ts"

/**
 * A slim header above a record preview (span detail / session "Memory changes")
 * with an "Open in Memory" link to the full record page — deep-linking the record
 * and, when given, a specific change.
 */
export function RecordPaneHeader({
  storeId,
  recordId,
  changeSpanId,
}: {
  readonly storeId: string
  readonly recordId: string
  readonly changeSpanId?: string
}) {
  const { projectSlug } = useParams({ strict: false })
  if (projectSlug == null) return null

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-secondary/50 px-3 py-1">
      <Text.H6 color="foregroundMuted" ellipsis noWrap className="font-mono">
        {recordDisplayLabel(recordId)}
      </Text.H6>
      <Link
        to="/projects/$projectSlug/memory/$store"
        params={{ projectSlug, store: encodeStoreSegment(storeId) }}
        search={{ record: encodeRecordParam(recordId), ...(changeSpanId ? { change: changeSpanId } : {}) }}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      >
        Open in Memory
        <ArrowUpRightIcon className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
