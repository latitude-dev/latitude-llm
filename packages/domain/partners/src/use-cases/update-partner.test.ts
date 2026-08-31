import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { PartnerId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createPartner } from "../entities/partner.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"
import { createFakePartnerRepository } from "../testing/fake-partner-repository.ts"
import { updatePartnerUseCase } from "./update-partner.ts"

const PARTNER_ID = PartnerId("a".repeat(24))
const ADMIN_ID = "u".repeat(24)

const createTestLayers = () => {
  const { repository, partners, secrets } = createFakePartnerRepository()
  const events: OutboxWriteEvent[] = []
  return {
    partners,
    secrets,
    events,
    testLayers: Layer.mergeAll(
      Layer.succeed(PartnerRepository, repository),
      Layer.succeed(OutboxEventWriter, {
        write: (event: OutboxWriteEvent) =>
          Effect.sync(() => {
            events.push(event)
          }),
      }),
      Layer.succeed(SqlClient, createFakeSqlClient()),
    ),
  }
}

const seed = (
  partners: Map<PartnerId, ReturnType<typeof createPartner>>,
  overrides: Partial<Parameters<typeof createPartner>[0]> = {},
) => {
  const partner = createPartner({
    id: PARTNER_ID,
    name: "Longitude",
    redirectUrls: ["https://longitude.example/oauth/callback"],
    scopes: ["accounts:provision"],
    ...overrides,
  })
  partners.set(partner.id, partner)
  return partner
}

describe("updatePartnerUseCase", () => {
  it("replaces name, icon, scopes and allowed IPs without touching the secret", async () => {
    const { partners, secrets, testLayers } = createTestLayers()
    seed(partners)
    secrets.set(PARTNER_ID, "original-secret")

    const updated = await Effect.runPromise(
      updatePartnerUseCase({
        id: PARTNER_ID,
        adminUserId: ADMIN_ID,
        name: "Longitude Inc",
        iconUrl: "https://longitude.example/new.png",
        redirectUrls: ["https://app.longitude.example/oauth/return"],
        scopes: [],
        allowedIps: ["203.0.113.0/24"],
      }).pipe(Effect.provide(testLayers)),
    )

    expect(updated).toMatchObject({
      name: "Longitude Inc",
      iconUrl: "https://longitude.example/new.png",
      redirectUrls: ["https://app.longitude.example/oauth/return"],
      scopes: [],
      allowedIps: ["203.0.113.0/24"],
    })
    expect(secrets.get(PARTNER_ID)).toBe("original-secret")
  })

  it("leaves the enabled flag and creation time alone", async () => {
    const { partners, testLayers } = createTestLayers()
    const createdAt = new Date("2026-01-01")
    seed(partners, { enabled: false, createdAt })

    const updated = await Effect.runPromise(
      updatePartnerUseCase({
        id: PARTNER_ID,
        adminUserId: ADMIN_ID,
        name: "Renamed",
        iconUrl: null,
        redirectUrls: ["https://longitude.example/oauth/callback"],
        scopes: [],
        allowedIps: [],
      }).pipe(Effect.provide(testLayers)),
    )

    expect(updated.enabled).toBe(false)
    expect(updated.createdAt).toEqual(createdAt)
  })

  it("rejects an icon URL that would violate the oauth_applications CHECK", () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners)

    expect(() =>
      Effect.runSync(
        updatePartnerUseCase({
          id: PARTNER_ID,
          adminUserId: ADMIN_ID,
          name: "Longitude",
          iconUrl: "javascript:alert(1)",
          redirectUrls: ["https://longitude.example/oauth/callback"],
          scopes: [],
          allowedIps: [],
        }).pipe(Effect.provide(testLayers)),
      ),
    ).toThrow()
  })

  it("fails as not found for an unknown partner", async () => {
    const { testLayers } = createTestLayers()

    const exit = await Effect.runPromiseExit(
      updatePartnerUseCase({
        id: PARTNER_ID,
        adminUserId: ADMIN_ID,
        name: "Longitude",
        iconUrl: null,
        redirectUrls: ["https://longitude.example/oauth/callback"],
        scopes: [],
        allowedIps: [],
      }).pipe(Effect.provide(testLayers)),
    )

    expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined).toBe(
      "NotFoundError",
    )
  })

  it("publishes AdminPartnerUpdated naming only the fields that moved", async () => {
    const { partners, events, testLayers } = createTestLayers()
    seed(partners, { iconUrl: "https://longitude.example/icon.png", allowedIps: ["203.0.113.0/24"] })

    await Effect.runPromise(
      updatePartnerUseCase({
        id: PARTNER_ID,
        adminUserId: ADMIN_ID,
        name: "Longitude Inc",
        iconUrl: "https://longitude.example/icon.png",
        redirectUrls: ["https://longitude.example/oauth/callback"],
        scopes: [],
        allowedIps: ["198.51.100.0/24"],
      }).pipe(Effect.provide(testLayers)),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "AdminPartnerUpdated",
      aggregateType: "partner",
      aggregateId: PARTNER_ID,
      organizationId: "system",
      payload: {
        adminUserId: ADMIN_ID,
        partnerId: PARTNER_ID,
        name: "Longitude Inc",
        changes: ["name", "scopes", "allowedIps"],
      },
    })
    expect(JSON.stringify(events[0])).not.toContain("198.51.100")
  })

  it("reports no changes when the edit was a no-op", async () => {
    const { partners, events, testLayers } = createTestLayers()
    const existing = seed(partners, { iconUrl: "https://longitude.example/icon.png", allowedIps: ["203.0.113.0/24"] })

    await Effect.runPromise(
      updatePartnerUseCase({
        id: PARTNER_ID,
        adminUserId: ADMIN_ID,
        name: existing.name,
        iconUrl: existing.iconUrl,
        redirectUrls: existing.redirectUrls,
        scopes: existing.scopes,
        allowedIps: existing.allowedIps,
      }).pipe(Effect.provide(testLayers)),
    )

    expect(events[0]).toMatchObject({ payload: { changes: [] } })
  })

  it("ignores reordering, since scopes and allowed IPs are sets", async () => {
    const { partners, events, testLayers } = createTestLayers()
    seed(partners, { scopes: ["accounts:provision"], allowedIps: ["203.0.113.0/24", "198.51.100.4"] })

    await Effect.runPromise(
      updatePartnerUseCase({
        id: PARTNER_ID,
        adminUserId: ADMIN_ID,
        name: "Longitude",
        iconUrl: null,
        redirectUrls: ["https://longitude.example/oauth/callback"],
        scopes: ["accounts:provision"],
        allowedIps: ["198.51.100.4", "203.0.113.0/24"],
      }).pipe(Effect.provide(testLayers)),
    )

    expect(events[0]).toMatchObject({ payload: { changes: [] } })
  })

  it("publishes nothing for an unknown partner", async () => {
    const { events, testLayers } = createTestLayers()

    await Effect.runPromiseExit(
      updatePartnerUseCase({
        id: PARTNER_ID,
        adminUserId: ADMIN_ID,
        name: "Longitude",
        iconUrl: null,
        redirectUrls: ["https://longitude.example/oauth/callback"],
        scopes: [],
        allowedIps: [],
      }).pipe(Effect.provide(testLayers)),
    )

    expect(events).toEqual([])
  })
})
