import { cn, Text } from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { SearchXIcon } from "lucide-react"
import type { MemoryZeroHitQueryRecord } from "../../../../../../domains/memories/memories.functions.ts"

const ROW_CLASS = "flex h-8 w-full items-center gap-2 rounded px-2 text-left"

/**
 * Zero-hit searches grouped by query — the "what to add to memory" report.
 * Rendered only when there is at least one zero-hit search in the window.
 */
export function UnansweredSearchesCard({ queries }: { readonly queries: readonly MemoryZeroHitQueryRecord[] }) {
  if (queries.length === 0) return null
  return (
    <div className="flex flex-col rounded-lg border">
      <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
        <SearchXIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Text.H6M>Unanswered searches</Text.H6M>
        <Text.H6 color="foregroundMuted">— searches that returned no records</Text.H6>
      </div>
      <div className="flex flex-col p-1">
        {queries.map((query) => (
          <div key={query.queryText} className={ROW_CLASS}>
            {query.queryText ? (
              <Text.H6 className="min-w-0 flex-1 truncate">
                <span title={query.queryText}>{query.queryText}</span>
              </Text.H6>
            ) : (
              <Text.H6 color="foregroundMuted" className="min-w-0 flex-1 truncate italic">
                query not captured
              </Text.H6>
            )}
            <Text.H6 color="foregroundMuted" className="shrink-0 whitespace-nowrap tabular-nums">
              {formatCount(query.searchCount)} {query.searchCount === 1 ? "search" : "searches"}
            </Text.H6>
            <span aria-hidden className="shrink-0 text-muted-foreground/40">
              ·
            </span>
            <Text.H6 color="foregroundMuted" className={cn("shrink-0 whitespace-nowrap tabular-nums")}>
              {relativeTime(new Date(query.lastSeenAt))}
            </Text.H6>
          </div>
        ))}
      </div>
    </div>
  )
}
