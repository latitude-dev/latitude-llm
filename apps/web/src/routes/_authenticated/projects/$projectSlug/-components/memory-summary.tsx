import type { ScopeMemorySummary } from "@domain/memories"
import { Badge, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { EyeIcon, SquarePenIcon } from "lucide-react"
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
 * `Memory` metric row for the trace / session detail body, sitting under Cost:
 * a read-tokens badge and a write badge (`+added` in success, `−removed` in
 * destructive), hover-expanding to a per-scope breakdown. Renders nothing until
 * the summary loads or when the session touched no memory. Pass `traceId` for
 * the trace view (restricts the write diff to that trace).
 */
export function MemorySummary({
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
  const hasRead = total.readTokens > 0
  const hasWrite = recordsChanged > 0 || total.tokensAdded > 0 || total.tokensRemoved > 0
  if (!hasRead && !hasWrite) return null

  return (
    <div className="flex min-h-8 flex-row items-center gap-3">
      <div className="flex min-w-12 self-center">
        <Text.H6 color="foregroundMuted" noWrap>
          Memory
        </Text.H6>
      </div>
      <Tooltip
        asChild
        trigger={
          <div className="flex flex-row flex-wrap items-center gap-1.5">
            {hasRead ? (
              <Badge variant="muted" iconProps={{ icon: EyeIcon, placement: "start", color: "foregroundMuted" }}>
                {`${formatCount(total.readTokens)} tok`}
              </Badge>
            ) : null}
            {hasWrite ? (
              <Badge variant="muted" iconProps={{ icon: SquarePenIcon, placement: "start", color: "foregroundMuted" }}>
                <span className="inline-flex items-center gap-1">
                  <span className="text-success">{`+${formatCount(total.tokensAdded)}`}</span>
                  <span className="text-destructive">{`−${formatCount(total.tokensRemoved)}`}</span>
                </span>
              </Badge>
            ) : null}
          </div>
        }
      >
        <div className="flex flex-col gap-1.5 text-left">
          {scopes.map((scope) => (
            <ScopeRow key={scope.scope} scope={scope} />
          ))}
        </div>
      </Tooltip>
    </div>
  )
}
