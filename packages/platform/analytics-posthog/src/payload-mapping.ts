import type { EventPayloads } from "@domain/events"
import type { PostHogCaptureInput } from "./client.ts"
import { isPostHogTracked } from "./whitelist.ts"

export const POSTHOG_ORGANIZATION_GROUP = "organization"

/**
 * Input for mapping a tracked domain event into a PostHog capture payload.
 * Fields mirror what the queue topic carries so the worker can pass the job
 * payload directly.
 */
export interface TrackedEventInput {
  readonly eventName: string
  readonly organizationId: string
  readonly payload: Record<string, unknown>
  readonly occurredAt: string
}

/**
 * Derives the PostHog distinctId for a backend event.
 *
 * Decision: backend events are org-attributed rather than user-attributed.
 * The domain-event payloads we ship today do not carry an actorUserId, and
 * revisiting that is out of scope for v1. Frontend events remain user-attributed
 * via posthog.identify; the two identity spaces are intentionally disjoint.
 */
export const orgDistinctId = (organizationId: string): string => `org_${organizationId}`

/**
 * Maps a tracked domain event to the PostHog capture shape.
 * Returns `null` when the event is not in the whitelist so the worker can skip
 * safely even if the upstream filter regresses.
 */
export const mapEventToPostHog = (input: TrackedEventInput): PostHogCaptureInput | null => {
  if (!isPostHogTracked(input.eventName)) return null

  return {
    distinctId: orgDistinctId(input.organizationId),
    event: input.eventName,
    // Pass the original payload verbatim as properties. PostHog accepts
    // arbitrary JSON-serializable values; downstream analyses can project
    // whichever fields they care about.
    properties: { ...input.payload },
    groups: { [POSTHOG_ORGANIZATION_GROUP]: input.organizationId },
    // CRITICAL: pass occurredAt through as `timestamp` so queue delays or
    // retries don't skew time-series analyses in PostHog.
    timestamp: new Date(input.occurredAt),
  }
}

/**
 * Builds the group-identify payload we send once per org so PostHog has a
 * stable record for the organization (name/slug come from OrganizationCreated).
 */
export const mapOrganizationGroupIdentify = (
  payload: EventPayloads["OrganizationCreated"],
): {
  groupType: string
  groupKey: string
  properties: Record<string, unknown>
} => ({
  groupType: POSTHOG_ORGANIZATION_GROUP,
  groupKey: payload.organizationId,
  properties: { name: payload.name, slug: payload.slug },
})
