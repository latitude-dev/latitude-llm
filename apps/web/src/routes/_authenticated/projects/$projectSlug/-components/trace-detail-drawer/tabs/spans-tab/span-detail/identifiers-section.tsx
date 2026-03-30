import { DetailSection, DetailSummary } from "@repo/ui"
import { FingerprintIcon } from "lucide-react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"

export function IdentifiersSection({ span }: { readonly span: SpanDetailRecord }) {
  return (
    <DetailSection icon={<FingerprintIcon className="w-4 h-4" />} label="Identifiers" defaultOpen={false}>
      <DetailSummary
        items={[
          { label: "Span ID", value: span.spanId, copyable: true },
          ...(span.parentSpanId?.trim() ? [{ label: "Parent Span ID", value: span.parentSpanId, copyable: true }] : []),
          { label: "Trace ID", value: span.traceId, copyable: true },
          ...(span.sessionId?.trim() ? [{ label: "Session ID", value: span.sessionId, copyable: true }] : []),
          ...(span.simulationId?.trim() ? [{ label: "Simulation ID", value: span.simulationId, copyable: true }] : []),
          ...(span.userId?.trim() ? [{ label: "User ID", value: span.userId, copyable: true }] : []),
          ...(span.apiKeyId?.trim() ? [{ label: "API Key ID", value: span.apiKeyId, copyable: true }] : []),
          ...(span.responseId?.trim() ? [{ label: "Response ID", value: span.responseId, copyable: true }] : []),
        ]}
      />
    </DetailSection>
  )
}
