import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { PartnerId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { PARTNER_SECRET_LENGTH } from "../constants.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"
import { createFakePartnerRepository } from "../testing/fake-partner-repository.ts"
import { createPartnerUseCase } from "./create-partner.ts"

const PARTNER_ID = PartnerId("a".repeat(24))
const ADMIN_ID = "u".repeat(24)
const REDIRECT_URLS = ["https://longitude.example/oauth/callback"]

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

describe("createPartnerUseCase", () => {
  it("persists the partner and returns the raw secret exactly once", async () => {
    const { partners, secrets, testLayers } = createTestLayers()

    const result = await Effect.runPromise(
      createPartnerUseCase({
        id: PARTNER_ID,
        adminUserId: ADMIN_ID,
        name: "Longitude",
        iconUrl: "https://longitude.example/icon.png",
        redirectUrls: REDIRECT_URLS,
        scopes: ["accounts:provision"],
      }).pipe(Effect.provide(testLayers)),
    )

    expect(result.rawSecret).toHaveLength(PARTNER_SECRET_LENGTH)
    expect(result.rawSecret).toMatch(/^[0-9a-f]+$/)
    expect(result.partner).toMatchObject({ name: "Longitude", enabled: true, scopes: ["accounts:provision"] })
    expect(partners.get(PARTNER_ID)?.name).toBe("Longitude")
    expect(secrets.get(PARTNER_ID)).toBe(result.rawSecret)
  })

  it("never reuses a secret between partners", async () => {
    const { testLayers } = createTestLayers()

    const first = await Effect.runPromise(
      createPartnerUseCase({ adminUserId: ADMIN_ID, name: "One", redirectUrls: REDIRECT_URLS, scopes: [] }).pipe(
        Effect.provide(testLayers),
      ),
    )
    const second = await Effect.runPromise(
      createPartnerUseCase({ adminUserId: ADMIN_ID, name: "Two", redirectUrls: REDIRECT_URLS, scopes: [] }).pipe(
        Effect.provide(testLayers),
      ),
    )

    expect(first.rawSecret).not.toBe(second.rawSecret)
    expect(first.partner.id).not.toBe(second.partner.id)
  })

  it("defaults to enabled, no icon, and no IP allowlist", async () => {
    const { testLayers } = createTestLayers()

    const { partner } = await Effect.runPromise(
      createPartnerUseCase({ adminUserId: ADMIN_ID, name: "Longitude", redirectUrls: REDIRECT_URLS, scopes: [] }).pipe(
        Effect.provide(testLayers),
      ),
    )

    expect(partner).toMatchObject({ enabled: true, iconUrl: null, allowedIps: [], deletedAt: null })
  })

  it("rejects an icon URL that would violate the oauth_applications CHECK", () => {
    const { testLayers } = createTestLayers()

    expect(() =>
      Effect.runSync(
        createPartnerUseCase({
          adminUserId: ADMIN_ID,
          name: "Longitude",
          iconUrl: "javascript:alert(1)",
          redirectUrls: REDIRECT_URLS,
          scopes: [],
        }).pipe(Effect.provide(testLayers)),
      ),
    ).toThrow()
  })

  it("rejects an allowlist entry that is not an IP or CIDR block", () => {
    const { testLayers } = createTestLayers()

    expect(() =>
      Effect.runSync(
        createPartnerUseCase({
          adminUserId: ADMIN_ID,
          name: "Longitude",
          redirectUrls: REDIRECT_URLS,
          scopes: [],
          allowedIps: ["not-an-ip"],
        }).pipe(Effect.provide(testLayers)),
      ),
    ).toThrow()
  })

  it("publishes AdminPartnerCreated alongside the row", async () => {
    const { events, testLayers } = createTestLayers()

    const { partner } = await Effect.runPromise(
      createPartnerUseCase({ adminUserId: ADMIN_ID, name: "Longitude", redirectUrls: REDIRECT_URLS, scopes: [] }).pipe(
        Effect.provide(testLayers),
      ),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "AdminPartnerCreated",
      aggregateType: "partner",
      aggregateId: partner.id,
      organizationId: "system",
      payload: { adminUserId: ADMIN_ID, partnerId: partner.id, name: "Longitude" },
    })
  })

  it("publishes nothing when the partner is rejected", () => {
    const { events, testLayers } = createTestLayers()

    expect(() =>
      Effect.runSync(
        createPartnerUseCase({
          adminUserId: ADMIN_ID,
          name: "Longitude",
          redirectUrls: REDIRECT_URLS,
          scopes: [],
          allowedIps: ["not-an-ip"],
        }).pipe(Effect.provide(testLayers)),
      ),
    ).toThrow()
    expect(events).toEqual([])
  })
})
