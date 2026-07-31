import { Badge, Text, Tooltip } from "@repo/ui"
import type { AdminUnpricedPairDto } from "../../../../domains/admin/unpriced-spans.functions.ts"

const STATE_LABEL: Record<AdminUnpricedPairDto["state"], string> = {
  regressed: "Regressed",
  active: "Needs pricing",
  resolved: "Resolved",
  wontFix: "Won't fix",
}

const STATE_VARIANT: Record<
  AdminUnpricedPairDto["state"],
  "destructive" | "warningMuted" | "successMuted" | "outlineMuted"
> = {
  regressed: "destructive",
  active: "warningMuted",
  resolved: "successMuted",
  wontFix: "outlineMuted",
}

const UNPRICEABLE_LABEL: Record<string, string> = {
  noPair: "no provider/model reported",
  localRuntime: "local runtime, no per-token rate exists",
  freeTier: "caller's own :free tier marker",
  catalogDeclines: "catalog lists this pair and gives it no rate",
}

/** The badge always carries its reasoning, so a parked row never looks like an unexplained dismissal. */
export function UnpricedStateBadge({ pair }: { pair: AdminUnpricedPairDto }) {
  const explanation = pair.triage
    ? pair.triage.decision === "fixed"
      ? pair.state === "regressed"
        ? `Recorded as fixed on ${pair.triage.fixedAt}, but spans have arrived since. ${pair.triage.note}`
        : `Fixed on ${pair.triage.fixedAt}; these rows predate it. ${pair.triage.note}`
      : `${pair.triage.reason}: ${pair.triage.note}`
    : pair.unpriceableReason
      ? UNPRICEABLE_LABEL[pair.unpriceableReason]
      : pair.cause === "ingestGap"
        ? "The registry prices this today, so these rows predate the fix and will age out."
        : pair.cause === "freePricing"
          ? "The registry prices this at zero, so the zero is correct."
          : "No catalog entry prices this pair. Spend in the window is understated."

  return (
    <Tooltip trigger={<Badge variant={STATE_VARIANT[pair.state]}>{STATE_LABEL[pair.state]}</Badge>}>
      <Text.H6>{explanation}</Text.H6>
    </Tooltip>
  )
}
