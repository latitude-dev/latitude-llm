import type { SpanStatusCode } from "../../entities/span.ts"
import { stringAttr } from "../attributes.ts"
import type { OtlpKeyValue } from "../types.ts"

// OpenClaw's diagnostics-otel plugin sets the OTel span status only on problems
// (e.g. `openclaw.liveness.warning` arrives `error`) and signals success via the
// `openclaw.outcome` attribute (`completed`) rather than an explicit OK — so
// successful spans arrive `unset` and would render as the neutral/gray status.
// Derive a real status from the outcome so success shows as ok and genuine
// failures (outcome not completed, or an OTel error) show as error.
const OPENCLAW_SCOPE = "openclaw"
const OPENCLAW_OK_OUTCOMES = new Set(["completed", "ok", "success"])

export function resolveStatusCode(
  spanAttrs: readonly OtlpKeyValue[],
  otelStatusCode: SpanStatusCode,
  scopeName: string,
): SpanStatusCode {
  if (scopeName !== OPENCLAW_SCOPE) return otelStatusCode
  // The plugin flags real failures on the OTel status; trust it when set.
  if (otelStatusCode === "error") return "error"

  const outcome = stringAttr(spanAttrs, "openclaw.outcome")
  if (outcome && !OPENCLAW_OK_OUTCOMES.has(outcome.toLowerCase())) return "error"

  // `completed`/success, or `unset` with no failure signal → a successful span.
  return "ok"
}
