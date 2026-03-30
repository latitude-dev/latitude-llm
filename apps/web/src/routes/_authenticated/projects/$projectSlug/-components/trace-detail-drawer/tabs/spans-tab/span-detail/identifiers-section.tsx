import { DetailSection, DetailSummary } from "@repo/ui"
import { FingerprintIcon } from "lucide-react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"

export function IdentifiersSection({ span }: { readonly span: SpanDetailRecord }) {
  return (
    <DetailSection icon={<FingerprintIcon className="w-4 h-4" />} label="Identifiers" defaultOpen={false}>
      <DetailSummary
        items={[
          { label: "Span ID", value: span.spanId, copyable: true },
          ...(span.parentSpanId ? [{ label: "Parent Span ID", value: span.parentSpanId, copyable: true }] : []),
          { label: "Trace ID", value: span.traceId, copyable: true },
          ...(span.sessionId ? [{ label: "Session ID", value: span.sessionId, copyable: true }] : []),
          ...(span.userId ? [{ label: "User ID", value: span.userId, copyable: true }] : []),
          ...(span.apiKeyId ? [{ label: "API Key ID", value: span.apiKeyId, copyable: true }] : []),
          ...(span.responseId ? [{ label: "Response ID", value: span.responseId, copyable: true }] : []),
        ]}
      />
    </DetailSection>
  )
}
