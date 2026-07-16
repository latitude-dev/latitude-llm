import type { ScopeMemorySummary } from "@domain/memories"
import { Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { DatabaseIcon } from "lucide-react"
import { useMemorySummary } from "../../../../../domains/memories/memories.collection.ts"

const scopeLabel = (scope: string) => (scope === "" ? "unscoped" : scope)

const ScopeRow = ({ scope }: { readonly scope: ScopeMemorySummary }) => (
  <div className="flex flex-col">
    <span className="font-medium">{scopeLabel(scope.scope)}</span>
    <span>
      {`+${scope.recordsAdded} ~${scope.recordsUpdated} −${scope.recordsRemoved} records · +${formatCount(scope.tokensAdded)} −${formatCount(scope.tokensRemoved)} tokens`}
      {scope.readTokens > 0 ? ` · read ${formatCount(scope.readTokens)}` : ""}
    </span>
  </div>
)

/**
 * Compact `read N · write +A −R` memory chip for the session and trace drawers.
 * Renders nothing until the summary loads or when the session touched no memory;
 * hovering expands to a per-scope breakdown. Pass `traceId` for the trace view.
 */
export function MemorySummaryChip({
  projectId,
  sessionId,
  traceId,
}: {
  readonly projectId: string
  readonly sessionId: string
  readonly traceId?: string
}) {
  const { data } = useMemorySummary({ projectId, sessionId, ...(traceId ? { traceId } : {}) })
  if (!data) return null

  const { total, scopes } = data
  const recordsChanged = total.recordsAdded + total.recordsUpdated + total.recordsRemoved
  const hasWrite = recordsChanged > 0 || total.tokensAdded > 0 || total.tokensRemoved > 0
  if (total.readTokens === 0 && !hasWrite) return null

  const parts: string[] = []
  if (total.readTokens > 0) parts.push(`read ${formatCount(total.readTokens)}`)
  if (hasWrite) parts.push(`write +${formatCount(total.tokensAdded)} −${formatCount(total.tokensRemoved)}`)

  return (
    <Tooltip
      asChild
      trigger={
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5">
          <DatabaseIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <Text.H6 color="foregroundMuted" noWrap>
            {parts.join(" · ")}
          </Text.H6>
        </span>
      }
    >
      <div className="flex flex-col gap-1.5 text-left">
        {scopes.map((scope) => (
          <ScopeRow key={scope.scope} scope={scope} />
        ))}
      </div>
    </Tooltip>
  )
}
