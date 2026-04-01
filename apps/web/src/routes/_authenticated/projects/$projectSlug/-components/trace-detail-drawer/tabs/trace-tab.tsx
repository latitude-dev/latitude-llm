import {
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

export function TraceTab({
  traceId,
  traceRecord,
  traceDetail,
  isRecordLoading,
  isDetailLoading,
}: {
  readonly traceId: string
  readonly traceRecord: TraceRecord | undefined
  readonly traceDetail: TraceDetailRecord | null | undefined
  readonly isRecordLoading: boolean
  readonly isDetailLoading: boolean
}) {
  const hasProviders = traceRecord && traceRecord.providers.length > 0
  const hasModels = traceRecord && traceRecord.models.length > 0
  const hasTags = traceRecord && traceRecord.tags.length > 0
  const hasMetadata = traceRecord && Object.keys(traceRecord.metadata).length > 0

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
            value: traceRecord ? formatDuration(traceRecord.durationNs) : undefined,
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
      {traceRecord && <UsageSummary data={traceRecord} />}

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
      <DetailSection icon={<TextIcon className="w-4 h-4" />} label="Metadata">
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
      <DetailSection icon={<BrainIcon className="w-4 h-4" />} label="System Instructions">
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

      <DetailSection icon={<ArrowDownRightIcon className="w-4 h-4" />} label="Input">
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

      <DetailSection icon={<ArrowUpRightIcon className="w-4 h-4" />} label="Output">
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
                ? [{ label: "Services", value: traceRecord.serviceNames.join(", ") }]
                : []),
            ]}
          />
        )}
      </DetailSection>
    </div>
  )
}
