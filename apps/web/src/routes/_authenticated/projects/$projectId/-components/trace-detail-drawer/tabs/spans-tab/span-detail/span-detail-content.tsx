import { DetailSummary, ModelBadge, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { useMemo } from "react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { formatDuration } from "../span-tree/tree-utils.ts"
import { hasAnyTokens, mergeAttributes, StatusBadge } from "./helpers.tsx"
import { IdentifiersSection } from "./identifiers-section.tsx"
import { LlmSections } from "./llm-sections.tsx"
import { OperationalMetadataSection } from "./operational-metadata-section.tsx"
import { RawTelemetrySections } from "./raw-telemetry-sections.tsx"
import { UsageSummary } from "./usage-summary.tsx"
import { UserContextSection } from "./user-context-section.tsx"

export function SpanDetailContent({ span }: { readonly span: SpanDetailRecord }) {
  const durationMs = useMemo(
    () => new Date(span.endTime).getTime() - new Date(span.startTime).getTime(),
    [span.endTime, span.startTime],
  )
  const mergedAttrs = useMemo(() => mergeAttributes(span), [span])

  const isLlmSpan = useMemo(
    () =>
      span.systemInstructions.length > 0 ||
      span.inputMessages.length > 0 ||
      span.outputMessages.length > 0 ||
      span.toolDefinitions.length > 0 ||
      hasAnyTokens(span),
    [span],
  )

  return (
    <div className="flex flex-col gap-6">
      {/* ── Status + Span ID ── */}
      <StatusBadge statusCode={span.statusCode} statusMessage={span.statusMessage} spanId={span.spanId} />

      {span.errorType && (
        <div className="flex flex-col gap-1">
          <Text.H6 color="destructive">Error Type</Text.H6>
          <Text.H5>{span.errorType}</Text.H5>
        </div>
      )}

      {/* ── Identifiers (collapsed by default) ── */}
      <IdentifiersSection span={span} />

      {/* ── Key facts ── */}
      <DetailSummary
        items={[
          { label: "Start Time", value: relativeTime(new Date(span.startTime)) },
          { label: "Duration", value: formatDuration(durationMs) },
          ...(span.operation ? [{ label: "Operation", value: span.operation }] : []),
        ]}
      />

      {/* ── Model + Provider ── */}
      <ModelBadge provider={span.provider} model={span.model} responseModel={span.responseModel} />

      {/* ── Usage: tokens + cost ── */}
      <UsageSummary span={span} />

      {/* ── User context: tags + metadata ── */}
      <UserContextSection span={span} />

      {/* ── LLM content ── */}
      {isLlmSpan && <LlmSections span={span} />}

      {/* ── Operational metadata ── */}
      <OperationalMetadataSection span={span} />

      {/* ── Raw telemetry ── */}
      <RawTelemetrySections span={span} mergedAttrs={mergedAttrs} />
    </div>
  )
}
