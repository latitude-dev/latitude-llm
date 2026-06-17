import type { DestinationHealthBadge } from "@domain/destinations"
import type { BadgeProps } from "@repo/ui"
import type { DestinationRecord } from "../../../../../../domains/destinations/destinations.functions.ts"

export const DESTINATION_KIND_LABEL: Record<DestinationRecord["kind"], string> = { posthog: "PostHog" }

/** Customer-facing health badge — supersedes the raw status badge on the card. */
export const DESTINATION_HEALTH_BADGE: Record<
  DestinationHealthBadge,
  { label: string; variant: BadgeProps["variant"] }
> = {
  healthy: { label: "Healthy", variant: "successMuted" },
  lagging: { label: "Lagging", variant: "warningMuted" },
  paused: { label: "Paused", variant: "muted" },
  quarantined: { label: "Quarantined", variant: "destructiveMuted" },
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

/**
 * Human-readable lag ("~3 min behind"). Lag never drops below the safety lag
 * (the window ends at `now − 5min`), so anything under a minute reads as
 * "up to date" rather than a misleading "0 sec".
 */
export const formatLag = (lagMs: number | null): string => {
  if (lagMs === null || lagMs < MINUTE_MS) return "Up to date"
  if (lagMs < HOUR_MS) return `~${Math.round(lagMs / MINUTE_MS)} min behind`
  const hours = lagMs / HOUR_MS
  return `~${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hr behind`
}
