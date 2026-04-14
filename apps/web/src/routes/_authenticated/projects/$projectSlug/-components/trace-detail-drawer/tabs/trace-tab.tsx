import type { FilterSet } from "@domain/shared"
import type { TraceCohortSummary } from "@domain/spans"
import {
  Badge,
  type BadgeProps,
  CodeBlock,
  Conversation,
  DetailSection,
  DetailSummary,
  ProviderIcon,
  Skeleton,
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
  return <CodeBlock value={formatted} copyable />
}

type Baselines = TraceCohortSummary["baselines"]

/** Get percentile badge for a value based on baselines (highest matching only) */
function getPercentileBadges(value: number, baselines: Baselines | undefined, metricKey: keyof Baselines): string[] {
  if (!baselines) return []

  const baseline = baselines[metricKey]
  if (baseline.sampleCount === 0) return []

  const badges: string[] = []

  // Show highest matching percentile badge only (p99 > p95 > p90)
  if (baseline.p99 !== null && value >= baseline.p99) {
    badges.push("p99")
  } else if (baseline.p95 !== null && value >= baseline.p95) {
    badges.push("p95")
  } else if (value >= baseline.p90) {
    badges.push("p90")
  }

  return badges
}

function PercentileBadge({ level, onClick }: { readonly level: string; readonly onClick?: (() => void) | undefined }) {
  const variant: BadgeProps["variant"] =
    level === "p99" ? "outlineDestructiveMuted" : level === "p95" ? "outlineWarningMuted" : "outlineAccent"

  const badge = <Badge variant={variant}>{level}</Badge>

  if (!onClick) return badge

  return (
    <button type="button" onClick={onClick} className="cursor-pointer hover:opacity-80 transition-opacity">
      {badge}
    </button>
  )
}

function getThresholdForBadge(badge: string, baselines: Baselines, metricKey: keyof Baselines): number | null {
  const baseline = baselines[metricKey]
  switch (badge) {
    case "p99":
      return baseline.p99
    case "p95":
      return baseline.p95
    case "p90":
      return baseline.p90
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

  const durationBadges =
    traceRecord && traceRecord.durationNs > 0
      ? getPercentileBadges(traceRecord.durationNs, baselines, "durationNs")
      : []
  const costBadges = traceRecord
    ? traceRecord.costTotalMicrocents > 0
      ? getPercentileBadges(traceRecord.costTotalMicrocents, baselines, "costTotalMicrocents")
      : []
    : []
  const ttftBadges = traceRecord
    ? traceRecord.timeToFirstTokenNs > 0
      ? getPercentileBadges(traceRecord.timeToFirstTokenNs, baselines, "timeToFirstTokenNs")
      : []
    : []

  const durationValue = traceRecord ? (
    <span className="flex items-center gap-1">
      {traceRecord.durationNs > 0 ? formatDuration(traceRecord.durationNs) : "-"}
      {durationBadges.map((badge) => {
        const threshold = baselines ? getThresholdForBadge(badge, baselines, "durationNs") : null
        return (
          <PercentileBadge
            key={badge}
            level={badge}
            onClick={
              threshold !== null && onFiltersChange ? () => handleFilterByThreshold("durationNs", threshold) : undefined
            }
          />
        )
      })}
    </span>
  ) : undefined

  const ttftValue = traceRecord ? (
    <span className="flex items-center gap-1">
      {traceRecord.timeToFirstTokenNs > 0 ? formatDuration(traceRecord.timeToFirstTokenNs) : "-"}
      {ttftBadges.map((badge) => {
        const threshold = baselines ? getThresholdForBadge(badge, baselines, "timeToFirstTokenNs") : null
        return (
          <PercentileBadge
            key={badge}
            level={badge}
            onClick={
              threshold !== null && onFiltersChange
                ? () => handleFilterByThreshold("timeToFirstTokenNs", threshold)
                : undefined
            }
          />
        )
      })}
    </span>
  ) : undefined

  const costBadgesNode =
    costBadges.length > 0
      ? costBadges.map((badge) => {
          const threshold = baselines ? getThresholdForBadge(badge, baselines, "costTotalMicrocents") : null
          return (
            <PercentileBadge
              key={badge}
              level={badge}
              onClick={
                threshold !== null && onFiltersChange
                  ? () => handleFilterByThreshold("costTotalMicrocents", threshold)
                  : undefined
              }
            />
          )
        })
      : undefined

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
            <div className="flex flex-col border-dashed border-border border-2 rounded-lg p-4 bg-secondary">
              <Conversation systemInstructions={traceDetail.systemInstructions} messages={[]} />
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
            <div className="flex flex-col border-dashed border-border border-2 rounded-lg p-4 bg-secondary">
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
            <div className="flex flex-col border-dashed border-border border-2 rounded-lg p-4 bg-secondary">
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
