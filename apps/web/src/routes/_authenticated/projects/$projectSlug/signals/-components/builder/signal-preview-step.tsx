import type { PreviewSessionSummary, SignalPreviewResult } from "@domain/evaluations"
import { Badge, Button, Conversation, cn, Icon, Skeleton, Text } from "@repo/ui"
import { ChevronDownIcon, ChevronUpIcon, RotateCwIcon } from "lucide-react"
import { useState } from "react"
import { useTraceConversationMessages } from "../../../../../../../domains/traces/traces.collection.ts"

type PreviewRow = Extract<SignalPreviewResult, { status: "done" }>["items"][number]
type Verdict = "match" | "no-match" | "skipped" | "errored"

// `skipped` is checked first: a skipped row has `passed: null`, which would otherwise read as "no match".
const verdictOf = (row: PreviewRow): Verdict =>
  row.skipped ? "skipped" : row.error !== null ? "errored" : row.passed === true ? "match" : "no-match"
// Matches first (the signal of interest), then non-matches, then skipped, then errors.
const verdictRank: Record<Verdict, number> = { match: 0, "no-match": 1, skipped: 2, errored: 3 }

const formatDuration = (ns: number): string => {
  const ms = ns / 1_000_000
  if (ms <= 0) return "0ms"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
}
const formatCost = (microcents: number): string => {
  const dollars = microcents / 100_000_000
  if (dollars <= 0) return "$0"
  return dollars < 0.01 ? `$${dollars.toFixed(4)}` : `$${dollars.toFixed(2)}`
}
const formatTokens = (tokens: number): string => (tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens))

function VerdictBadge({ verdict }: { readonly verdict: Verdict }) {
  if (verdict === "errored") return <Badge variant="warningMuted">errored</Badge>
  if (verdict === "skipped") return <Badge variant="outlineMuted">skipped</Badge>
  if (verdict === "match") return <Badge variant="accent">match</Badge>
  return <Badge variant="muted">no match</Badge>
}

function MetricsPanel({ summary }: { readonly summary: PreviewSessionSummary }) {
  const metrics: ReadonlyArray<readonly [string, string]> = [
    ["Duration", formatDuration(summary.durationNs)],
    ["Cost", formatCost(summary.costMicrocents)],
    ["Tokens", formatTokens(summary.tokensTotal)],
    ["Traces", String(summary.traceCount)],
    ["Errors", String(summary.errorCount)],
  ]
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 bg-muted/30 px-4 py-3">
      {metrics.map(([label, val]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <Text.H6 color="foregroundMuted">{label}</Text.H6>
          <Text.H5>{val}</Text.H5>
        </div>
      ))}
    </div>
  )
}

/** The expanded peek: full session metrics + conversation, loaded on demand. No navigation. */
function ExpandedSession({
  projectId,
  traceId,
  summary,
}: {
  readonly projectId: string
  readonly traceId: string
  readonly summary: PreviewSessionSummary | null
}) {
  const { messages, isLoading } = useTraceConversationMessages({ projectId, traceId })
  return (
    <div className="flex flex-col border-t border-border">
      {summary ? <MetricsPanel summary={summary} /> : null}
      <div className="max-h-72 overflow-y-auto overflow-x-hidden border-t border-border bg-background px-4 py-3">
        {isLoading && messages.length === 0 ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : messages.length === 0 ? (
          <Text.H6 color="foregroundMuted">No messages for this session.</Text.H6>
        ) : (
          <Conversation messages={messages} />
        )}
      </div>
    </div>
  )
}

function PreviewResultCard({
  row,
  projectId,
  expanded,
  onToggle,
}: {
  readonly row: PreviewRow
  readonly projectId: string
  readonly expanded: boolean
  readonly onToggle: () => void
}) {
  const verdict = verdictOf(row)
  const prompt = row.summary?.firstUserMessage?.trim()
  const reason =
    verdict === "skipped"
      ? "This session isn't embedded yet. It'll be scored once its embeddings are ready"
      : (row.error ?? (row.feedback.trim().length > 0 ? row.feedback : null))

  return (
    <div
      className={cn("flex flex-col rounded-lg border", {
        "border-border bg-accent/5": verdict === "match",
        "border-border": verdict !== "match",
      })}
    >
      <button type="button" onClick={onToggle} className="flex cursor-pointer flex-col gap-1.5 px-3 py-2.5 text-left">
        <div className="flex items-center justify-between gap-3">
          <VerdictBadge verdict={verdict} />
          {row.summary ? (
            <Text.H6 color="foregroundMuted" noWrap>
              {`${formatDuration(row.summary.durationNs)} · ${formatCost(row.summary.costMicrocents)} · ${formatTokens(row.summary.tokensTotal)} tok`}
            </Text.H6>
          ) : null}
        </div>
        <Text.H5 ellipsis noWrap>
          {prompt && prompt.length > 0 ? prompt : `Session ${row.sessionId.slice(0, 8)}`}
        </Text.H5>
        <div className="flex items-center justify-between gap-2">
          <Text.H6 color={verdict === "errored" ? "destructive" : "foregroundMuted"} ellipsis noWrap>
            {reason ?? "—"}
          </Text.H6>
          <Icon icon={expanded ? ChevronUpIcon : ChevronDownIcon} size="sm" color="foregroundMuted" />
        </div>
      </button>
      {expanded ? <ExpandedSession projectId={projectId} traceId={row.traceId} summary={row.summary} /> : null}
    </div>
  )
}

/**
 * Step 3 — runs the preview on entry (the parent owns the result + loading state). Shows the
 * hit-rate up front, matches first, and each session as a recognizable card (prompt + metrics +
 * reason) that expands in place to the full metrics + conversation. The user can advance without waiting.
 */
export function SignalPreviewStep({
  result,
  isRunning,
  onRun,
  projectId,
}: {
  readonly result: SignalPreviewResult | null
  readonly isRunning: boolean
  readonly onRun: () => void
  readonly projectId: string
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const items = result?.status === "done" ? result.items : []
  const matchCount = items.filter((row) => row.passed === true).length
  const sorted = [...items].sort((a, b) => verdictRank[verdictOf(a)] - verdictRank[verdictOf(b)])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {result?.status === "done" && items.length > 0 ? (
          <Text.H5M>
            {matchCount} of {items.length} matched
          </Text.H5M>
        ) : (
          <Text.H6 color="foregroundMuted">Latest matching sessions, scored with the current evaluation.</Text.H6>
        )}
        <Button variant="outline" size="sm" onClick={onRun} disabled={isRunning} isLoading={isRunning}>
          <Icon icon={RotateCwIcon} size="sm" />
          Run again
        </Button>
      </div>

      {isRunning ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : result === null || result.status === "pending" ? (
        <Text.H6 color="foregroundMuted">Run a preview to see how the evaluation scores recent sessions.</Text.H6>
      ) : result.status === "error" ? (
        <Text.H6 color="destructive">{result.error}</Text.H6>
      ) : sorted.length === 0 ? (
        <Text.H6 color="foregroundMuted">No recent sessions match the current scope.</Text.H6>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((row) => {
            const key = `${row.sessionId}:${row.traceId}`
            return (
              <PreviewResultCard
                key={key}
                row={row}
                projectId={projectId}
                expanded={expandedKey === key}
                onToggle={() => setExpandedKey((current) => (current === key ? null : key))}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
