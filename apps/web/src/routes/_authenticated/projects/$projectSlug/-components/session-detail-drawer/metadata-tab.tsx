import type { FilterSet } from "@domain/shared"
import {
  CodeBlock,
  Conversation,
  DetailSection,
  DetailSummary,
  ProviderIcon,
  TagBadgeList,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatDuration, relativeTime } from "@repo/utils"
import { ArrowDownRightIcon, ArrowUpRightIcon, BrainIcon, FingerprintIcon, TextIcon } from "lucide-react"
import { useMemo } from "react"
import type { SessionDetailRecord } from "../../../../../../domains/sessions/sessions.functions.ts"
import { useSpansBySessionCollection } from "../../../../../../domains/spans/spans.collection.ts"
import { SessionOutlierBadge, type SessionOutlierMetric } from "../session-outlier-badge.tsx"
import { DurationBar } from "../trace-detail-drawer/duration-bar.tsx"
import { computeSessionDurationBreakdown } from "../trace-detail-drawer/duration-composition.ts"
import { UsageSummary } from "../trace-detail-drawer/tabs/spans-tab/span-detail/usage-summary.tsx"

// Sessions only expose percentile filters for duration/TTFT/cost
// (`PERCENTILE_SESSION_FILTER_FIELDS`), so the tokens badge stays informational
// — there is no session-level `tokens` filter to push.
const METRIC_FILTER_FIELD: Partial<Record<SessionOutlierMetric, string>> = {
  durationNs: "duration",
  timeToFirstTokenNs: "ttft",
  costTotalMicrocents: "cost",
}

function JsonBlock({ value }: { readonly value: unknown }) {
  const formatted = useMemo(() => JSON.stringify(value, null, 2), [value])
  return <CodeBlock value={formatted} className="bg-secondary" />
}

export function MetadataTab({
  session,
  filters,
  onFiltersChange,
}: {
  readonly session: SessionDetailRecord
  readonly filters?: FilterSet | undefined
  readonly onFiltersChange?: ((filters: FilterSet) => void) | undefined
}) {
  const hasProviders = session.providers.length > 0
  const hasModels = session.models.length > 0
  const hasTags = session.tags.length > 0
  const hasMetadata = Object.keys(session.metadata).length > 0

  const handleFilterByThreshold = (metric: SessionOutlierMetric, threshold: number) => {
    if (!onFiltersChange) return
    const field = METRIC_FILTER_FIELD[metric]
    if (!field) return

    const newFilters = { ...(filters ?? {}) }
    const existingConditions = newFilters[field] ?? []
    const otherConditions = existingConditions.filter((c) => c.op !== "gte")
    newFilters[field] = [...otherConditions, { op: "gte", value: threshold }]

    onFiltersChange(newFilters)
  }

  const renderBadge = (metric: SessionOutlierMetric, value: number) => (
    <SessionOutlierBadge
      projectId={session.projectId}
      value={value}
      metric={metric}
      onThresholdClick={
        onFiltersChange && METRIC_FILTER_FIELD[metric]
          ? (threshold) => handleFilterByThreshold(metric, threshold)
          : undefined
      }
    />
  )

  const { data: spans, isLoading: isSpansLoading } = useSpansBySessionCollection({
    projectId: session.projectId,
    sessionId: session.sessionId,
    startTimeFrom: session.startTime,
    startTimeTo: session.endTime,
  })
  const durationBreakdown = useMemo(() => computeSessionDurationBreakdown(spans ?? []), [spans])
  const fallbackDurationMs = session.durationNs / 1_000_000
  const durationWallClockMs = durationBreakdown.wallClockMs > 0 ? durationBreakdown.wallClockMs : fallbackDurationMs
  const durationBadge = renderBadge("durationNs", session.durationNs)

  const ttftValue = (
    <span className="flex items-center gap-1">
      {renderBadge("timeToFirstTokenNs", session.timeToFirstTokenNs)}
      {session.timeToFirstTokenNs > 0 ? formatDuration(session.timeToFirstTokenNs) : "-"}
    </span>
  )

  const costBadgesNode = renderBadge("costTotalMicrocents", session.costTotalMicrocents)

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
      {/* ── Key facts ── */}
      <DetailSummary
        items={[
          {
            label: "Start Time",
            value: relativeTime(new Date(session.startTime)),
          },
          {
            label: "TTFT",
            value: ttftValue,
          },
          {
            label: "Spans",
            value: `${formatCount(session.spanCount)}${session.errorCount > 0 ? ` (${session.errorCount} err)` : ""}`,
          },
        ]}
      />

      {/* ── Providers + Models ── */}
      {(hasProviders || hasModels) && (
        <div className="flex flex-row flex-wrap items-center gap-2">
          {hasProviders &&
            session.providers.map((p) => (
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
              {session.models.join(", ")}
            </Text.H5>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <DurationBar
          segments={durationBreakdown.segments}
          wallClockMs={durationWallClockMs}
          badges={durationBadge}
          isLoading={isSpansLoading}
        />
        <UsageSummary data={session} costBadges={costBadgesNode} />
      </div>

      <div className="flex flex-col gap-1">
        <Text.H6 color="foregroundMuted">Tags</Text.H6>
        {hasTags ? (
          <TagBadgeList tags={session.tags} />
        ) : (
          <Text.H6 color="foregroundMuted" italic>
            No tags
          </Text.H6>
        )}
      </div>

      <DetailSection icon={<TextIcon className="h-4 w-4" />} label="Metadata" defaultOpen={false}>
        {() =>
          hasMetadata ? (
            <JsonBlock value={session.metadata} />
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No metadata
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<BrainIcon className="h-4 w-4" />} label="System Instructions" defaultOpen={false}>
        {() =>
          session.systemInstructions.length ? (
            <div className="flex flex-col rounded-lg bg-secondary p-4">
              <Conversation messages={[{ role: "system", parts: session.systemInstructions }]} />
            </div>
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No system instructions
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<ArrowDownRightIcon className="h-4 w-4" />} label="Input" defaultOpen={false}>
        {() =>
          session.inputMessages.length ? (
            <div className="flex flex-col rounded-lg bg-secondary p-4">
              <Conversation messages={session.inputMessages} />
            </div>
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No input messages
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<ArrowUpRightIcon className="h-4 w-4" />} label="Output" defaultOpen={true}>
        {() =>
          session.outputMessages.length ? (
            <div className="flex flex-col rounded-lg bg-secondary p-4">
              <Conversation messages={session.outputMessages} />
            </div>
          ) : (
            <Text.H6 color="foregroundMuted" italic>
              No output messages
            </Text.H6>
          )
        }
      </DetailSection>

      <DetailSection icon={<FingerprintIcon className="h-4 w-4" />} label="Identifiers" defaultOpen={false}>
        {() => (
          <DetailSummary
            items={[
              { label: "Session ID", value: session.sessionId, copyable: true },
              ...(session.traceIds.length === 1
                ? [{ label: "Trace ID", value: session.traceIds[0] as string, copyable: true }]
                : []),
              ...(session.simulationId?.trim()
                ? [
                    {
                      label: "Simulation ID",
                      value: session.simulationId,
                      copyable: true,
                    },
                  ]
                : []),
              ...(session.userId?.trim() ? [{ label: "User ID", value: session.userId, copyable: true }] : []),
              ...(session.rootSpanId?.trim()
                ? [
                    {
                      label: "Root Span ID",
                      value: session.rootSpanId,
                      copyable: true,
                    },
                  ]
                : []),
              ...(session.serviceNames.length > 0
                ? [
                    {
                      label: "Services",
                      value: session.serviceNames.join(", "),
                      copyable: true,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </DetailSection>
    </div>
  )
}
