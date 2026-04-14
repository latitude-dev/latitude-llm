import { describe, expect, it } from "vitest"
import {
  mapEventToPostHog,
  mapOrganizationGroupIdentify,
  orgDistinctId,
  POSTHOG_ORGANIZATION_GROUP,
} from "./payload-mapping.ts"

describe("mapEventToPostHog", () => {
  const occurredAt = "2026-04-13T12:00:00.000Z"

  it("uses actorUserId as distinctId when present", () => {
    const mapped = mapEventToPostHog({
      eventName: "OrganizationCreated",
      organizationId: "org-123",
      payload: { organizationId: "org-123", actorUserId: "user-42", name: "Acme", slug: "acme" },
      occurredAt,
    })

    expect(mapped).not.toBeNull()
    if (!mapped) return
    expect(mapped.distinctId).toBe("user-42")
    expect(mapped.event).toBe("OrganizationCreated")
    expect(mapped.groups).toEqual({ [POSTHOG_ORGANIZATION_GROUP]: "org-123" })
    expect(mapped.timestamp?.toISOString()).toBe(occurredAt)
  })

  it("falls back to org distinctId and skips person profile when no user context", () => {
    const mapped = mapEventToPostHog({
      eventName: "FirstTraceReceived",
      organizationId: "org-1",
      payload: { organizationId: "org-1", projectId: "proj-1", traceId: "t-1" },
      occurredAt,
    })

    expect(mapped?.distinctId).toBe("org_org-1")
    expect(mapped?.properties?.$process_person_profile).toBe(false)
  })

  it("does NOT set $process_person_profile for user-attributed events", () => {
    const mapped = mapEventToPostHog({
      eventName: "ApiKeyCreated",
      organizationId: "org-1",
      payload: { organizationId: "org-1", actorUserId: "user-1", apiKeyId: "k-1", name: "test" },
      occurredAt,
    })

    expect(mapped?.distinctId).toBe("user-1")
    expect(mapped?.properties?.$process_person_profile).toBeUndefined()
  })

  it("uses userId for UserSignedUp events", () => {
    const mapped = mapEventToPostHog({
      eventName: "UserSignedUp",
      organizationId: "system",
      payload: { userId: "user-new", email: "a@b.com" },
      occurredAt,
    })

    expect(mapped?.distinctId).toBe("user-new")
  })

  it("maps ProjectCreated", () => {
    const mapped = mapEventToPostHog({
      eventName: "ProjectCreated",
      organizationId: "org-1",
      payload: { organizationId: "org-1", projectId: "proj-1", name: "P", slug: "p" },
      occurredAt,
    })

    expect(mapped?.event).toBe("ProjectCreated")
    expect(mapped?.groups?.organization).toBe("org-1")
    expect(mapped?.properties).toMatchObject({ projectId: "proj-1" })
  })

  it("maps DatasetCreated", () => {
    const mapped = mapEventToPostHog({
      eventName: "DatasetCreated",
      organizationId: "org-1",
      payload: {
        organizationId: "org-1",
        actorUserId: "u-1",
        projectId: "proj-1",
        datasetId: "d-1",
        name: "My Dataset",
      },
      occurredAt,
    })

    expect(mapped?.event).toBe("DatasetCreated")
    expect(mapped?.properties).toMatchObject({ datasetId: "d-1", name: "My Dataset" })
  })

  it("returns null for events not in the whitelist (defense-in-depth)", () => {
    // Even if the dispatcher regresses and sends an untracked event, the
    // mapper must refuse to produce a capture payload.
    expect(
      mapEventToPostHog({
        eventName: "SpanIngested",
        organizationId: "org-1",
        payload: { organizationId: "org-1", projectId: "p", traceId: "t" },
        occurredAt,
      }),
    ).toBeNull()

    expect(
      mapEventToPostHog({
        eventName: "UnknownEvent",
        organizationId: "org-1",
        payload: {},
        occurredAt,
      }),
    ).toBeNull()
  })
})

describe("orgDistinctId", () => {
  it("prefixes with org_ so it doesn't collide with frontend user distinctIds", () => {
    expect(orgDistinctId("abc")).toBe("org_abc")
  })
})

describe("mapOrganizationGroupIdentify", () => {
  it("builds a group-identify payload from OrganizationCreated", () => {
    const identify = mapOrganizationGroupIdentify({
      organizationId: "org-9",
      actorUserId: "user-1",
      name: "Acme",
      slug: "acme",
    })

    expect(identify).toEqual({
      groupType: POSTHOG_ORGANIZATION_GROUP,
      groupKey: "org-9",
      properties: { name: "Acme", slug: "acme" },
    })
  })
})
