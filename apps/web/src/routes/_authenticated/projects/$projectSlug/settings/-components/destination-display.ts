import type { BadgeProps } from "@repo/ui"
import type { DestinationRecord } from "../../../../../../domains/destinations/destinations.functions.ts"

export const DESTINATION_KIND_LABEL: Record<DestinationRecord["kind"], string> = { posthog: "PostHog" }

export const DESTINATION_STATUS_BADGE: Record<
  DestinationRecord["status"],
  { label: string; variant: BadgeProps["variant"] }
> = {
  active: { label: "Active", variant: "successMuted" },
  paused: { label: "Paused", variant: "muted" },
  quarantined: { label: "Quarantined", variant: "destructiveMuted" },
}
