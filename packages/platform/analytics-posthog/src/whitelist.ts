import type { EventPayloads } from "@domain/events"

export type TrackedEventName = keyof EventPayloads & string

/**
 * Domain events that are fanned out to PostHog. Keep this list short and
 * high-signal — every entry turns into wire traffic to PostHog Cloud per
 * occurrence. Per-trace or span-level events do NOT belong here.
 */
export const POSTHOG_TRACKED_EVENTS = new Set<TrackedEventName>([
  "OrganizationCreated",
  "ProjectCreated",
  "ScoreCreated",
])

export const isPostHogTracked = (name: string): name is TrackedEventName =>
  POSTHOG_TRACKED_EVENTS.has(name as TrackedEventName)
