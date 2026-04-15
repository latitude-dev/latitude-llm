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
 * When the event payload includes `actorUserId` (user-initiated actions), we
 * use the real user id so PostHog can attribute the event to the same person
 * identified on the frontend via posthog.identify(). This enables mixed
 * frontend↔backend funnels ("viewed page → created API key").
 *
 * For system-initiated events without a user context (FirstTraceReceived,
 * SpanIngested, etc.) we fall back to an org-scoped pseudo-id.
 */
/**
 * Returns true when the event has a real user behind it — either via
 * `actorUserId` (explicit) or `userId` (UserSignedUp / MemberJoined).
 */
const hasUserContext = (input: TrackedEventInput): boolean => {
  const actorUserId = input.payload.actorUserId
  if (typeof actorUserId === "string" && actorUserId.length > 0) return true
  const userId = input.payload.userId
  if (typeof userId === "string" && userId.length > 0) return true
  return false
}

const resolveDistinctId = (input: TrackedEventInput): string => {
  const actorUserId = input.payload.actorUserId
  if (typeof actorUserId === "string" && actorUserId.length > 0) {
    return actorUserId
  }
  // UserSignedUp and MemberJoined carry userId (the actor themselves)
  const userId = input.payload.userId
  if (typeof userId === "string" && userId.length > 0) {
    return userId
  }
  return orgDistinctId(input.organizationId)
}

export const orgDistinctId = (organizationId: string): string => `org_${organizationId}`

/**
 * Maps a tracked domain event to the PostHog capture shape.
 * Returns `null` when the event is not in the whitelist so the worker can skip
 * safely even if the upstream filter regresses.
 */
export const mapEventToPostHog = (input: TrackedEventInput): PostHogCaptureInput | null => {
  if (!isPostHogTracked(input.eventName)) return null

  return {
    distinctId: resolveDistinctId(input),
    event: input.eventName,
    // Pass the original payload verbatim as properties. PostHog accepts
    // arbitrary JSON-serializable values; downstream analyses can project
    // whichever fields they care about.
    properties: {
      ...input.payload,
      // System-initiated events (no user context) are captured as anonymous
      // so PostHog doesn't create phantom person records for org pseudo-ids.
      // Also up to 4x cheaper per PostHog's pricing model.
      ...(!hasUserContext(input) ? { $process_person_profile: false } : {}),
    },
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
