import type { FilterSet } from "@domain/shared"
import { getTraceMetricPercentileThreshold, type TraceCohortSummary } from "@domain/spans"
import {
  CodeBlock,
  Conversation,
  DetailSection,
  DetailSummary,
  ProviderIcon,
  Skeleton,
  Status,
  type StatusProps,
  TagBadgeList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, relativeTime } from "@repo/utils"
import { ArrowDownRightIcon, ArrowUpRightIcon, BrainIcon, FingerprintIcon, TextIcon } from "lucide-react"
import { useMemo } from "react"
import type { TraceDetailRecord, TraceRecord } from "../../../../../../../domains/traces/traces.functions.ts"
import { UsageSummary } from "./spans-tab/span-detail/usage-summary.tsx"

function JsonBlock({ value }: { readonly value: unknown }) {
  const formatted = useMemo(() => JSON.stringify(value, null, 2), [value])
  return <CodeBlock value={formatted} copyable className="bg-secondary" />
}

type Baselines = TraceCohortSummary["baselines"]
type PercentileLevel = "p99" | "p95" | "p90"

function getPercentileLevel(
  value: number,
  baselines: Baselines | undefined,
  metricKey: keyof Baselines,
): PercentileLevel | undefined {
  if (!baselines) return undefined

  const baseline = baselines[metricKey]
  const p99 = getTraceMetricPercentileThreshold(baseline, "p99")
  const p95 = getTraceMetricPercentileThreshold(baseline, "p95")
  const p90 = getTraceMetricPercentileThreshold(baseline, "p90")

  if (p99 !== null && value >= p99) {
    return "p99"
  }

  if (p95 !== null && value >= p95) {
    return "p95"
  }

  if (p90 !== null && value >= p90) {
    return "p90"
  }

  return undefined
}

function getPercentileStatusVariant(level: PercentileLevel): NonNullable<StatusProps["variant"]> {
  switch (level) {
    case "p99":
      return "destructive"
    case "p95":
      return "warning"
    case "p90":
      return "info"
  }
}

function PercentileStatus({
  level,
  onClick,
}: {
  readonly level: PercentileLevel
  readonly onClick?: (() => void) | undefined
}) {
  const status = <Status variant={getPercentileStatusVariant(level)} label={level} />

  if (!onClick) return status

  return (
    <button type="button" onClick={onClick} className="cursor-pointer hover:opacity-80 transition-opacity">
      {status}
    </button>
  )
}

function getThresholdForLevel(level: PercentileLevel, baselines: Baselines, metricKey: keyof Baselines): number | null {
  switch (level) {
    case "p99":
      return getTraceMetricPercentileThreshold(baselines[metricKey], "p99")
    case "p95":
      return getTraceMetricPercentileThreshold(baselines[metricKey], "p95")
    case "p90":
      return getTraceMetricPercentileThreshold(baselines[metricKey], "p90")
    default:
      return null
  }
}

export function TraceTab({
  traceId,
  traceRecord,
  traceDetail,
  isRecordLoading,
  isDetailLoading,
  baselines,
  filters,
  onFiltersChange,
  defaultSectionsOpen = true,
}: {
  readonly traceId: string
  readonly traceRecord: TraceRecord | undefined
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly isRecordLoading: boolean
  readonly isDetailLoading: boolean
  readonly baselines?: Baselines | undefined
  readonly filters?: FilterSet | undefined
  readonly onFiltersChange?: ((filters: FilterSet) => void) | undefined
  /** Whether detail sections (Metadata, System Instructions, Input, Output) are open by default. Defaults to true. */
  readonly defaultSectionsOpen?: boolean
}) {
  const hasProviders = traceRecord && traceRecord.providers.length > 0
  const hasModels = traceRecord && traceRecord.models.length > 0
  const hasTags = traceRecord && traceRecord.tags.length > 0
  const hasMetadata = traceRecord && Object.keys(traceRecord.metadata).length > 0

  // Map metric keys to their corresponding filter field names
  const metricKeyToFilterField = (metricKey: keyof Baselines): string => {
    switch (metricKey) {
      case "durationNs":
        return "duration"
      case "timeToFirstTokenNs":
        return "ttft"
      case "costTotalMicrocents":
        return "cost"
      default:
        return metricKey
    }
  }

  // Handle filter by percentile threshold
  const handleFilterByThreshold = (metricKey: keyof Baselines, threshold: number) => {
    if (!onFiltersChange) return

    const field = metricKeyToFilterField(metricKey)
    const newFilters = { ...(filters ?? {}) }

    // Add or update the gte condition for this field
    const existingConditions = newFilters[field] ?? []
    const otherConditions = existingConditions.filter((c) => c.op !== "gte")

    newFilters[field] = [...otherConditions, { op: "gte", value: threshold }]

    onFiltersChange(newFilters)
  }

  const durationBadge =
    traceRecord && traceRecord.durationNs > 0
      ? getPercentileLevel(traceRecord.durationNs, baselines, "durationNs")
      : undefined
  const costBadge = traceRecord
    ? traceRecord.costTotalMicrocents > 0
      ? getPercentileLevel(traceRecord.costTotalMicrocents, baselines, "costTotalMicrocents")
      : undefined
    : undefined
  const ttftBadge = traceRecord
    ? traceRecord.timeToFirstTokenNs > 0
      ? getPercentileLevel(traceRecord.timeToFirstTokenNs, baselines, "timeToFirstTokenNs")
      : undefined
    : undefined

  const durationValue = traceRecord ? (
    <span className="flex items-center gap-1">
      {durationBadge ? (
        <PercentileStatus
          level={durationBadge}
          onClick={
            baselines && onFiltersChange
              ? () => {
                  const threshold = getThresholdForLevel(durationBadge, baselines, "durationNs")
                  if (threshold !== null) {
                    handleFilterByThreshold("durationNs", threshold)
                  }
                }
              : undefined
          }
        />
      ) : null}
      {traceRecord.durationNs > 0 ? formatDuration(traceRecord.durationNs) : "-"}
    </span>
  ) : undefined

  const ttftValue = traceRecord ? (
    <span className="flex items-center gap-1">
      {ttftBadge ? (
        <PercentileStatus
          level={ttftBadge}
          onClick={
            baselines && onFiltersChange
              ? () => {
                  const threshold = getThresholdForLevel(ttftBadge, baselines, "timeToFirstTokenNs")
                  if (threshold !== null) {
                    handleFilterByThreshold("timeToFirstTokenNs", threshold)
                  }
                }
              : undefined
          }
        />
      ) : null}
      {traceRecord.timeToFirstTokenNs > 0 ? formatDuration(traceRecord.timeToFirstTokenNs) : "-"}
    </span>
  ) : undefined

  const costBadgesNode = costBadge ? (
    <PercentileStatus
      level={costBadge}
      onClick={
        baselines && onFiltersChange
          ? () => {
              const threshold = getThresholdForLevel(costBadge, baselines, "costTotalMicrocents")
              if (threshold !== null) {
                handleFilterByThreshold("costTotalMicrocents", threshold)
              }
            }
          : undefined
      }
    />
  ) : undefined

  return (
    <div className="flex flex-col gap-6 py-6 px-4 overflow-y-auto flex-1">
      {/* ── Key facts ── */}
      <DetailSummary
        items={[
          {
            label: "Start Time",
            value: traceRecord ? relativeTime(new Date(traceRecord.startTime)) : undefined,
            isLoading: isRecordLoading,
          },
          {
            label: "Duration",
            value: durationValue,
            isLoading: isRecordLoading,
          },
          {
            label: "TTFT",
            value: ttftValue,
            isLoading: isRecordLoading,
          },
          {
            label: "Spans",
            value: traceRecord
              ? `${formatCount(traceRecord.spanCount)}${traceRecord.errorCount > 0 ? ` (${traceRecord.errorCount} err)` : ""}`
              : undefined,
            isLoading: isRecordLoading,
          },
        ]}
      />

      {/* ── Providers + Models ── */}
      {(hasProviders || hasModels) && (
        <div className="flex flex-row items-center gap-2 flex-wrap">
          {hasProviders &&
            traceRecord.providers.map((p) => (
              <Tooltip
                key={p}
                asChild
                trigger={
                  <span>
                    <ProviderIcon provider={p} size="sm" />
                  </span>
                }
              >
                {p}
              </Tooltip>
            ))}
          {hasModels && (
            <Text.H5 color="foregroundMuted" noWrap>
              {traceRecord.models.join(", ")}
            </Text.H5>
          )}
        </div>
      )}

      {/* ── Usage: tokens + cost ── */}
      {traceRecord && <UsageSummary data={traceRecord} costBadges={costBadgesNode} />}

      {/* ── Tags ── */}
      <div className="flex flex-col gap-1">
        <Text.H6 color="foregroundMuted">Tags</Text.H6>
        {isRecordLoading ? (
          <Skeleton className="h-5 w-32" />
        ) : hasTags ? (
          <TagBadgeList tags={traceRecord.tags} />
        ) : (
          <Text.H6 color="foregroundMuted" italic>
            No tags
          </Text.H6>
        )}
      </div>

      {/* ── Metadata ── */}
      <DetailSection icon={<TextIcon className="w-4 h-4" />} label="Metadata" defaultOpen={defaultSectionsOpen}>
        {() =>
          isRecordLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : hasMetadata ? (
            <JsonBlock value={traceRecord.metadata} />
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No metadata
            </Text.H6>
          )
        }
      </DetailSection>

      {/* ── LLM content ── */}
      <DetailSection
        icon={<BrainIcon className="w-4 h-4" />}
        label="System Instructions"
        defaultOpen={defaultSectionsOpen}
      >
        {() =>
          isDetailLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : traceDetail?.systemInstructions.length ? (
            <div className="flex flex-col rounded-lg bg-secondary p-4">
              <Conversation messages={[{ role: "system", parts: traceDetail.systemInstructions }]} />
            </div>
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No system instructions
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<ArrowDownRightIcon className="w-4 h-4" />} label="Input" defaultOpen={defaultSectionsOpen}>
        {() =>
          isDetailLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : traceDetail?.inputMessages.length ? (
            <div className="flex flex-col rounded-lg bg-secondary p-4">
              <Conversation messages={traceDetail.inputMessages} />
            </div>
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No input messages
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<ArrowUpRightIcon className="w-4 h-4" />} label="Output" defaultOpen={defaultSectionsOpen}>
        {() =>
          isDetailLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : traceDetail?.outputMessages.length ? (
            <div className="flex flex-col rounded-lg bg-secondary p-4">
              <Conversation messages={traceDetail.outputMessages} />
            </div>
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No output messages
            </Text.H6>
          )
        }
      </DetailSection>

      {/* ── Identifiers (collapsed by default) ── */}
      <DetailSection icon={<FingerprintIcon className="w-4 h-4" />} label="Identifiers" defaultOpen={false}>
        {() => (
          <DetailSummary
            items={[
              { label: "Trace ID", value: traceId, copyable: true },
              ...(traceRecord?.sessionId?.trim()
                ? [{ label: "Session ID", value: traceRecord.sessionId, copyable: true }]
                : []),
              ...(traceRecord?.simulationId?.trim()
                ? [{ label: "Simulation ID", value: traceRecord.simulationId, copyable: true }]
                : []),
              ...(traceRecord?.userId?.trim() ? [{ label: "User ID", value: traceRecord.userId, copyable: true }] : []),
              ...(traceRecord?.rootSpanId?.trim()
                ? [{ label: "Root Span ID", value: traceRecord.rootSpanId, copyable: true }]
                : []),
              ...(traceRecord?.serviceNames && traceRecord.serviceNames.length > 0
                ? [{ label: "Services", value: traceRecord.serviceNames.join(", "), copyable: true }]
                : []),
            ]}
          />
        )}
      </DetailSection>
    </div>
  )
}
