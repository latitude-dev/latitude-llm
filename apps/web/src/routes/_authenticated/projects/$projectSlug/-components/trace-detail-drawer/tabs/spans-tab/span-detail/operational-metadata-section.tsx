import { DetailSection, DetailSummary, Icon, Tooltip } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import { CircleAlertIcon, CircleCheckIcon, CircleHelpIcon, ServerIcon } from "lucide-react"
import type { SpanDetailRecord } from "../../../../../../../../../domains/spans/spans.functions.ts"

type FinishReasonClassification = SpanDetailRecord["finishReasonClassifications"][number]

const finishReasonTooltip = (reason: FinishReasonClassification): string => {
  if (reason.classification === "unmapped") {
    return "Latitude does not recognize this provider finish reason yet."
  }

  if (reason.classification === "unreliable") {
    switch (reason.kind) {
      case "length":
        return "Reached a length limit; only incomplete output is considered a failure."
      case "contentFilter":
        return "A provider content filter stopped the generation."
      case "guardrail":
        return "A guardrail stopped the generation."
      case "malformedFunctionCall":
        return "The model stopped after producing a malformed tool call."
      case "generationError":
        return "The provider reported a generation error."
    }
  }

  switch (reason.kind) {
    case "normal":
      return "The model completed normally."
    case "callerStop":
      return "Generation was stopped by the caller."
    case "toolContinuation":
      return "The model stopped to request a tool."
    case "refusal":
      return "The model ended with an explicit refusal."
  }
}

function FinishReasons({ reasons }: { readonly reasons: readonly FinishReasonClassification[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {reasons.map((reason, index) => {
        const destructive = reason.classification === "unreliable" && !reason.requiresOutputDamage
        const icon =
          reason.classification === "clean"
            ? CircleCheckIcon
            : reason.classification === "unreliable"
              ? CircleAlertIcon
              : CircleHelpIcon
        const classificationLabel =
          reason.classification === "clean"
            ? "Clean finish reason"
            : reason.classification === "unreliable"
              ? "Unreliable finish reason"
              : "Unmapped finish reason"

        return (
          <span key={`${reason.rawValue}-${index}`} className="inline-flex items-center gap-1">
            <Tooltip
              asChild
              trigger={
                <button type="button" aria-label={classificationLabel} className="inline-flex shrink-0 items-center">
                  <Icon icon={icon} size="xs" color={destructive ? "destructive" : "foregroundMuted"} />
                </button>
              }
            >
              {finishReasonTooltip(reason)}
            </Tooltip>
            <span className={destructive ? "text-destructive" : undefined}>{reason.rawValue}</span>
          </span>
        )
      })}
    </span>
  )
}

export function OperationalMetadataSection({ span }: { readonly span: SpanDetailRecord }) {
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
          ...(span.finishReasonClassifications.length > 0
            ? [{ label: "Finish Reasons", value: <FinishReasons reasons={span.finishReasonClassifications} /> }]
            : span.finishReasons.length > 0
              ? [{ label: "Finish Reasons", value: span.finishReasons.join(", ") }]
              : []),
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
