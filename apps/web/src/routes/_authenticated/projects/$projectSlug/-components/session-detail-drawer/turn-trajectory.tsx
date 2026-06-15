import { cn, DetailSection, type SegmentBarItem, Skeleton, Text, Tooltip } from "@repo/ui"
import { formatCount, formatDuration, formatPrice } from "@repo/utils"
import { ActivityIcon, ClockIcon, type LucideIcon, MessageSquareIcon, WrenchIcon } from "lucide-react"
import { Fragment, type ReactNode, use, useMemo } from "react"
import { useAnnotationCountsByTraceIds } from "../../../../../../domains/annotations/annotations.collection.ts"
import type { SpanRecord } from "../../../../../../domains/spans/spans.functions.ts"
import { TraceScopeContext } from "../../../../../../domains/traces/trace-scope.tsx"
import { useTraceCohortSummary, useTraceDetail } from "../../../../../../domains/traces/traces.collection.ts"
import type { TraceRecord } from "../../../../../../domains/traces/traces.functions.ts"
import { useInView } from "../../../../../../lib/hooks/useInView.ts"
import { computePerTraceBreakdowns, type TraceDurationBreakdown } from "../trace-detail-drawer/duration-composition.ts"
import { SegmentBreakdownRows } from "../trace-detail-drawer/segment-breakdown-rows.tsx"
import { formatDuration as formatDurationMs } from "../trace-detail-drawer/tabs/spans-tab/span-tree/tree-utils.ts"
import {
  computeToolStatsByTrace,
  computeTurnHealth,
  inputPreview,
  outputPreview,
  type ToolStats,
  type TurnHealth,
} from "./turn-trajectory.utils.ts"

const MICROCENTS_PER_DOLLAR = 100_000_000
// Below this, a between-turn gap is noise (clock skew, fast back-to-back turns).
const GAP_THRESHOLD_MS = 1_000

const cost = (microcents: number) => formatPrice(microcents / MICROCENTS_PER_DOLLAR)

function Chip({
  icon: Icon,
  count,
  tooltip,
}: {
  readonly icon: LucideIcon
  readonly count: number
  readonly tooltip: string
}) {
  return (
    <Tooltip
      asChild
      trigger={
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          <Icon className="h-3 w-3" aria-hidden />
          {count}
        </span>
      }
    >
      {tooltip}
    </Tooltip>
  )
}

function HealthDot({ health }: { readonly health: TurnHealth }) {
  if (health.tone === "none") return <span className="size-1.5 shrink-0" aria-hidden />
  return (
    <Tooltip
      asChild
      trigger={
        <span
          className={cn("size-1.5 shrink-0 rounded-full", health.tone === "danger" ? "bg-rose-500" : "bg-amber-500")}
          aria-hidden
        />
      }
    >
      {health.reason}
    </Tooltip>
  )
}

function MetaRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-row items-center justify-between gap-4">
      <Text.H6 color="foregroundMuted">{label}</Text.H6>
      <Text.H6 color="foreground">{value}</Text.H6>
    </div>
  )
}

function TurnTooltip({
  breakdown,
  trace,
}: {
  readonly breakdown: TraceDurationBreakdown
  readonly trace: TraceRecord
}) {
  const compSegments: SegmentBarItem[] = breakdown.segments.map((s) => ({
    label: s.label,
    value: s.ms,
    color: s.color,
  }))
  return (
    <div className="flex min-w-[160px] flex-col gap-2">
      {compSegments.length > 0 && <SegmentBreakdownRows segments={compSegments} formatValue={formatDurationMs} />}
      <div className="flex flex-col gap-1">
        <MetaRow label="TTFT" value={trace.timeToFirstTokenNs > 0 ? formatDuration(trace.timeToFirstTokenNs) : "-"} />
        <MetaRow label="Tokens" value={formatCount(trace.tokensTotal)} />
        <MetaRow label="Cost" value={cost(trace.costTotalMicrocents)} />
      </div>
    </div>
  )
}

function TurnCard({
  trace,
  number,
  projectId,
  breakdown,
  health,
  toolStats,
  annotationCount,
  model,
  onOpen,
}: {
  readonly trace: TraceRecord
  readonly number: number
  readonly projectId: string
  readonly breakdown: TraceDurationBreakdown | undefined
  readonly health: TurnHealth
  readonly toolStats: ToolStats | undefined
  readonly annotationCount: number
  readonly model: string | null
  readonly onOpen: (traceId: string) => void
}) {
  const [cardRef, inView] = useInView<HTMLButtonElement>({ rootMargin: "200px" })
  const { data: detail } = useTraceDetail({ projectId, traceId: trace.traceId, enabled: inView })
  const input = detail ? inputPreview(detail.inputMessages) : ""
  const output = detail ? outputPreview(detail.outputMessages) : ""
  const showSkeleton = !detail

  const durationText = formatDuration(trace.durationNs)
  const meta: { key: string; node: ReactNode }[] = [
    {
      key: "duration",
      node:
        breakdown && breakdown.wallClockMs > 0 ? (
          <Tooltip asChild trigger={<span className="tabular-nums">{durationText}</span>}>
            <TurnTooltip breakdown={breakdown} trace={trace} />
          </Tooltip>
        ) : (
          <span className="tabular-nums">{durationText}</span>
        ),
    },
    { key: "cost", node: <span className="tabular-nums">{cost(trace.costTotalMicrocents)}</span> },
  ]
  if (toolStats && toolStats.tools > 0) {
    meta.push({
      key: "tools",
      node: (
        <Chip
          icon={WrenchIcon}
          count={toolStats.tools}
          tooltip={`${toolStats.tools} tool ${toolStats.tools === 1 ? "call" : "calls"}${
            toolStats.failed > 0 ? ` (${toolStats.failed} failed)` : ""
          }`}
        />
      ),
    })
  }
  if (annotationCount > 0) {
    meta.push({
      key: "annotations",
      node: (
        <Chip
          icon={MessageSquareIcon}
          count={annotationCount}
          tooltip={`${annotationCount} ${annotationCount === 1 ? "annotation" : "annotations"}`}
        />
      ),
    })
  }

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={() => onOpen(trace.traceId)}
      aria-label={`Open turn ${number}${health.tone === "none" ? "" : ` — ${health.reason}`}`}
      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted"
    >
      <div className="flex shrink-0 items-center gap-1.5 pt-px">
        <HealthDot health={health} />
        <div className="min-w-4 text-right tabular-nums">
          <Text.H6 color="foregroundMuted" noWrap>
            {number}
          </Text.H6>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="min-w-0">
          {showSkeleton ? (
            <Skeleton className="h-3 w-3/4" />
          ) : input ? (
            <Text.H6 color="foreground" ellipsis noWrap>
              {input}
            </Text.H6>
          ) : null}
        </div>

        {(showSkeleton || output) && (
          <div className="flex min-w-0 flex-row items-center gap-1">
            <Text.H6 color="foregroundMuted" noWrap>
              ↳
            </Text.H6>
            {showSkeleton ? (
              <Skeleton className="h-3 w-1/2" />
            ) : (
              <Text.H6 color="foregroundMuted" ellipsis noWrap>
                {output}
              </Text.H6>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
          {meta.map((item, i) => (
            <Fragment key={item.key}>
              {i > 0 && <span aria-hidden>·</span>}
              {item.node}
            </Fragment>
          ))}
          {model && <span className="ml-auto truncate pl-2">{model}</span>}
        </div>
      </div>
    </button>
  )
}

/**
 * Per-turn index of a multi-trace session: one card per trace (turn), read
 * oldest→newest. Each card previews the turn's input/output above a muted
 * metadata line, with a health dot flagging errored or outlier (slow/expensive)
 * turns. Previews fetch lazily as each card scrolls into view.
 */
export function TurnTrajectory({
  traces,
  spans,
  traceNumberById,
  totalTraceCount,
  projectId,
  onOpenTrace,
}: {
  readonly traces: readonly TraceRecord[]
  readonly spans: readonly SpanRecord[]
  readonly traceNumberById: ReadonlyMap<string, number>
  readonly totalTraceCount: number
  readonly projectId: string
  readonly onOpenTrace: (traceId: string) => void
}) {
  const isSandbox = !!use(TraceScopeContext)
  const chronological = useMemo(() => [...traces].reverse(), [traces])
  const perTrace = useMemo(() => computePerTraceBreakdowns(spans), [spans])
  const toolStats = useMemo(() => computeToolStatsByTrace(spans), [spans])
  const traceIds = useMemo(() => traces.map((t) => t.traceId), [traces])
  const { data: annotationCounts } = useAnnotationCountsByTraceIds({ projectId, traceIds, enabled: !isSandbox })
  const { data: cohorts } = useTraceCohortSummary({ projectId })

  if (chronological.length <= 1) return null

  return (
    <DetailSection
      icon={<ActivityIcon className="h-4 w-4" />}
      label={`Turns (${chronological.length})`}
      defaultOpen={chronological.length <= 12}
      contentClassName="max-h-[28rem]"
    >
      {() => (
        <div className="flex w-full flex-col gap-0.5">
          {chronological.map((trace, i) => {
            const counts = annotationCounts?.get(trace.traceId)
            const prev = chronological[i - 1]
            const gapMs = prev ? Date.parse(trace.startTime) - Date.parse(prev.endTime) : 0
            const model =
              trace.models.length > 0 && trace.models.join(", ") !== (prev?.models.join(", ") ?? "")
                ? trace.models.join(", ")
                : null

            return (
              <Fragment key={trace.traceId}>
                {gapMs > GAP_THRESHOLD_MS && (
                  <div className="flex items-center gap-2 px-2 py-0.5">
                    <ClockIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <Text.H6 color="foregroundMuted" noWrap>
                      {formatDuration(gapMs * 1_000_000)}
                    </Text.H6>
                  </div>
                )}
                <TurnCard
                  trace={trace}
                  number={traceNumberById.get(trace.traceId) ?? i + 1}
                  projectId={projectId}
                  breakdown={perTrace.get(trace.traceId)}
                  health={computeTurnHealth(trace, cohorts)}
                  toolStats={toolStats.get(trace.traceId)}
                  annotationCount={(counts?.positiveCount ?? 0) + (counts?.negativeCount ?? 0)}
                  model={model}
                  onOpen={onOpenTrace}
                />
              </Fragment>
            )
          })}

          {totalTraceCount > chronological.length && (
            <Text.H6 color="foregroundMuted">
              {`Showing first ${chronological.length} of ${totalTraceCount} turns`}
            </Text.H6>
          )}
        </div>
      )}
    </DetailSection>
  )
}
