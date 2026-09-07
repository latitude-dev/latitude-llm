import { DetailSection, DetailSummary } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { ServerIcon } from "lucide-react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"

export function OperationalMetadataSection({ span }: { readonly span: SpanDetailRecord }) {
  const finishClassifications = span.finishReasonClassifications
    .map((reason) => {
      if (reason.classification === "unmapped") return `${reason.rawValue}: unmapped`
      if (reason.classification === "unreliable" && reason.requiresOutputDamage) {
        return `${reason.rawValue}: unreliable when output is damaged`
      }
      return `${reason.rawValue}: ${reason.classification} (${reason.kind})`
    })
    .join(", ")
  const providerErrorClassification = span.providerErrorClassification
    ? span.providerErrorClassification.classification === "unmapped"
      ? `${span.providerErrorClassification.rawValue}: unmapped`
      : `${span.providerErrorClassification.rawValue}: ${span.providerErrorClassification.kind}`
    : ""

  return (
    <DetailSection icon={<ServerIcon className="w-4 h-4" />} label="Operational">
      <DetailSummary
        items={[
          { label: "Kind", value: span.kind.toUpperCase() },
          { label: "Service", value: span.serviceName || "-" },
          ...(span.scopeName
            ? [{ label: "Scope", value: `${span.scopeName}${span.scopeVersion ? `@${span.scopeVersion}` : ""}` }]
            : []),
          ...(span.responseModel ? [{ label: "Response Model", value: span.responseModel }] : []),
          ...(span.finishReasons.length > 0 ? [{ label: "Finish Reasons", value: span.finishReasons.join(", ") }] : []),
          ...(finishClassifications ? [{ label: "Finish Classification", value: finishClassifications }] : []),
          ...(providerErrorClassification
            ? [{ label: "Provider Error Classification", value: providerErrorClassification }]
            : []),
          ...(span.traceState ? [{ label: "Trace State", value: span.traceState }] : []),
          { label: "Trace Flags", value: String(span.traceFlags) },
          { label: "Ingested At", value: relativeTime(new Date(span.ingestedAt)) },
        ]}
      />
    </DetailSection>
  )
}
