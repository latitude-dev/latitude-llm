import { DetailSummary, ModelBadge, Text } from "@repo/ui"
import { relativeTime, safeParseJson } from "@repo/utils"
import { useMemo } from "react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"
import { formatDuration } from "../span-tree/tree-utils.ts"
import { mergeAttributes, StatusBadge } from "./helpers.tsx"
import { IdentifiersSection } from "./identifiers-section.tsx"
import { LlmSections } from "./llm-sections.tsx"
import { OperationalMetadataSection } from "./operational-metadata-section.tsx"
import { RawTelemetrySections } from "./raw-telemetry-sections.tsx"
import { isToolExecutionSpan, ToolExecutionSection } from "./tool-execution-section.tsx"
import { hasAnyUsage, UsageSummary } from "./usage-summary.tsx"
import { UserContextSection } from "./user-context-section.tsx"

type ExceptionInfo = {
  type?: string
  message?: string
  stacktrace?: string
}

function extractException(eventsJson: string): ExceptionInfo | undefined {
  const events = safeParseJson(eventsJson)
  if (!Array.isArray(events)) return undefined

  for (const event of events) {
    if (event?.name !== "exception" || !event.attributes) continue
    const attrs = event.attributes as Array<{ key: string; value?: { stringValue?: string } }>
    const info: ExceptionInfo = {}
    for (const attr of attrs) {
      if (attr.key === "exception.type") info.type = attr.value?.stringValue
      if (attr.key === "exception.message") info.message = attr.value?.stringValue
      if (attr.key === "exception.stacktrace") info.stacktrace = attr.value?.stringValue
    }
    if (info.type || info.message || info.stacktrace) return info
  }
  return undefined
}

function ErrorSection({ span }: { readonly span: SpanDetailRecord }) {
  const exception = useMemo(() => extractException(span.eventsJson), [span.eventsJson])

  if (span.statusCode !== "error" && !span.errorType && !exception) return null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      {span.errorType && (
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="destructive">Error Type</Text.H6>
          <Text.H5 monospace>{span.errorType}</Text.H5>
        </div>
      )}

      {(span.statusMessage || exception?.message) && (
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="destructive">Message</Text.H6>
          <Text.H5 monospace>{exception?.message || span.statusMessage}</Text.H5>
        </div>
      )}

      {exception?.stacktrace && (
        <div className="flex flex-col gap-0.5">
          <Text.H6 color="destructive">Stack Trace</Text.H6>
          <pre className="text-xs font-mono text-foreground bg-muted rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
            {exception.stacktrace}
          </pre>
        </div>
      )}
    </div>
  )
}

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
      hasAnyUsage(span),
    [span],
  )
  const isToolSpan = useMemo(() => isToolExecutionSpan(span), [span])

  return (
    <div className="flex flex-col gap-6">
      {/* ── Status + Span ID ── */}
      <StatusBadge statusCode={span.statusCode} statusMessage={span.statusMessage} spanId={span.spanId} />

      {/* ── Error details ── */}
      <ErrorSection span={span} />

      {/* ── Identifiers (collapsed by default) ── */}
      <IdentifiersSection span={span} />

      {/* ── Key facts ── */}
      <DetailSummary
        items={[
          { label: "Start Time", value: relativeTime(new Date(span.startTime)) },
          { label: "Duration", value: formatDuration(durationMs) },
          ...(span.operation ? [{ label: "Operation", value: span.operation }] : []),
          ...(isLlmSpan ? [{ label: "Streaming", value: span.isStreaming ? "Yes" : "No" }] : []),
          ...(isLlmSpan
            ? [
                {
                  label: "Time to First Token",
                  value: span.timeToFirstTokenNs > 0 ? formatDuration(span.timeToFirstTokenNs / 1_000_000) : "Unknown",
                },
              ]
            : []),
        ]}
      />

      {/* ── Model + Provider ── */}
      <ModelBadge provider={span.provider} model={span.model} responseModel={span.responseModel} />

      {/* ── Usage: tokens + cost ── */}
      <UsageSummary data={span} />

      {/* ── User context: tags + metadata ── */}
      <UserContextSection span={span} />

      {/* ── LLM content ── */}
      {isLlmSpan && <LlmSections span={span} />}

      {/* ── Tool execution ── */}
      {isToolSpan && <ToolExecutionSection span={span} />}

      {/* ── Operational metadata ── */}
      <OperationalMetadataSection span={span} />

      {/* ── Raw telemetry ── */}
      <RawTelemetrySections span={span} mergedAttrs={mergedAttrs} />
    </div>
  )
}
