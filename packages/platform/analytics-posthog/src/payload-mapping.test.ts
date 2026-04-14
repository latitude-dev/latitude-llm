import { describe, expect, it } from "vitest"
import {
  mapEventToPostHog,
  mapOrganizationGroupIdentify,
  orgDistinctId,
  POSTHOG_ORGANIZATION_GROUP,
} from "./payload-mapping.ts"

describe("mapEventToPostHog", () => {
  const occurredAt = "2026-04-13T12:00:00.000Z"

  it("maps OrganizationCreated with org-scoped distinctId, group, and timestamp", () => {
    const mapped = mapEventToPostHog({
      eventName: "OrganizationCreated",
      organizationId: "org-123",
      payload: { organizationId: "org-123", name: "Acme", slug: "acme" },
      occurredAt,
    })

    expect(mapped).not.toBeNull()
    if (!mapped) return
    expect(mapped.distinctId).toBe("org_org-123")
    expect(mapped.event).toBe("OrganizationCreated")
    expect(mapped.properties).toEqual({ organizationId: "org-123", name: "Acme", slug: "acme" })
    expect(mapped.groups).toEqual({ [POSTHOG_ORGANIZATION_GROUP]: "org-123" })
    expect(mapped.timestamp?.toISOString()).toBe(occurredAt)
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

  it("maps ScoreCreated", () => {
    const mapped = mapEventToPostHog({
      eventName: "ScoreCreated",
      organizationId: "org-1",
      payload: { organizationId: "org-1", projectId: "proj-1", scoreId: "s-1", issueId: null },
      occurredAt,
    })

    expect(mapped?.event).toBe("ScoreCreated")
    expect(mapped?.properties).toMatchObject({ scoreId: "s-1", issueId: null })
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
