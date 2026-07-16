import type { MemoryRecordSummary, SessionMemorySummary } from "@domain/memories"
import { cn, Text, Tooltip } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { EyeIcon, type LucideIcon, MinusIcon, PlusIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useMemorySummary } from "../../../../../domains/memories/memories.collection.ts"

const TONE_CLASS = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-muted text-success-muted-foreground",
  destructive: "bg-destructive-muted text-destructive-muted-foreground",
} as const

function MetricPill({
  icon: Icon,
  tone,
  children,
}: {
  readonly icon: LucideIcon
  readonly tone: keyof typeof TONE_CLASS
  readonly children: ReactNode
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1", TONE_CLASS[tone])}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-xs font-medium tabular-nums">{children}</span>
    </span>
  )
}

const MAX_ROWS = 10

const scopeLabel = (scope: string) => (scope === "" ? "unscoped" : scope)

function Metric({ icon: Icon, value }: { readonly icon: LucideIcon; readonly value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Text.H6 color="foreground">{formatCount(value)}</Text.H6>
    </span>
  )
}

function RecordMetrics({ record }: { readonly record: MemoryRecordSummary }) {
  return (
    <span className="flex shrink-0 flex-row items-center gap-2.5 tabular-nums">
      {record.readTokens > 0 ? <Metric icon={EyeIcon} value={record.readTokens} /> : null}
      {record.tokensAdded > 0 ? <Metric icon={PlusIcon} value={record.tokensAdded} /> : null}
      {record.tokensRemoved > 0 ? <Metric icon={MinusIcon} value={record.tokensRemoved} /> : null}
    </span>
  )
}

/**
 * Detailed hover breakdown: records grouped by store, each with inline read /
 * added / removed token metrics. Records with no activity in a metric omit it.
 */
function MemoryBreakdown({ summary }: { readonly summary: SessionMemorySummary }) {
  const sorted = [...summary.records].sort(
    (a, b) => b.readTokens + b.tokensAdded + b.tokensRemoved - (a.readTokens + a.tokensAdded + a.tokensRemoved),
  )
  const shown = sorted.slice(0, MAX_ROWS)
  const hidden = sorted.length - shown.length
  const multiScope = new Set(sorted.map((record) => record.scope)).size > 1

  const groups: { scope: string; storeId: string; records: MemoryRecordSummary[] }[] = []
  for (const record of shown) {
    const group = groups.find((candidate) => candidate.scope === record.scope && candidate.storeId === record.storeId)
    if (group) group.records.push(record)
    else groups.push({ scope: record.scope, storeId: record.storeId, records: [record] })
  }

  return (
    <div className="flex min-w-[200px] flex-col gap-2 text-left">
      {groups.map((group) => (
        <div key={`${group.scope} ${group.storeId}`} className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted" ellipsis>
            {multiScope ? `${scopeLabel(group.scope)} · ${group.storeId || "—"}` : group.storeId || "—"}
          </Text.H6>
          {group.records.map((record) => (
            <div
              key={`${record.storeId} ${record.recordId}`}
              className="flex flex-row items-center justify-between gap-4 pl-2"
            >
              <Text.H6 color="foreground" ellipsis>
                {record.recordId || "—"}
              </Text.H6>
              <RecordMetrics record={record} />
            </div>
          ))}
        </div>
      ))}
      {hidden > 0 ? (
        <Text.H6 color="foregroundMuted" italic>
          {`+${hidden} more record${hidden === 1 ? "" : "s"}`}
        </Text.H6>
      ) : null}
    </div>
  )
}

/**
 * `Memory` metric row for the trace / session detail body, sitting under Cost:
 * soft-colored pills for read tokens (neutral), added tokens (success), and
 * removed tokens (destructive), hover-expanding to a per-record read/write
 * breakdown grouped by store. Renders nothing until the summary loads or when the
 * session touched no memory. Pass `traceId` for the trace view (restricts writes).
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

  const { total } = data
  const showRead = total.readTokens > 0
  // A write with no token delta (`+0 −0`) is nothing to show; when there is one,
  // both directions render so the added/removed pair always reads together.
  const showWrite = total.tokensAdded > 0 || total.tokensRemoved > 0
  if (!showRead && !showWrite) return null

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
            {showRead ? (
              <MetricPill icon={EyeIcon} tone="neutral">
                {`${formatCount(total.readTokens)} tok`}
              </MetricPill>
            ) : null}
            {showWrite ? (
              <>
                <MetricPill icon={PlusIcon} tone="success">
                  {`${formatCount(total.tokensAdded)} tok`}
                </MetricPill>
                <MetricPill icon={MinusIcon} tone="destructive">
                  {`${formatCount(total.tokensRemoved)} tok`}
                </MetricPill>
              </>
            ) : null}
          </div>
        }
      >
        <MemoryBreakdown summary={data} />
      </Tooltip>
    </div>
  )
}
