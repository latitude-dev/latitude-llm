import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { PartnerId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createPartner } from "../entities/partner.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"
import { createFakePartnerRepository } from "../testing/fake-partner-repository.ts"
import { setPartnerEnabledUseCase } from "./set-partner-enabled.ts"

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

describe("setPartnerEnabledUseCase", () => {
  it("disables an enabled partner", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners)

    const updated = await Effect.runPromise(
      setPartnerEnabledUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID, enabled: false }).pipe(
        Effect.provide(testLayers),
      ),
    )

    expect(updated.enabled).toBe(false)
    expect(partners.get(PARTNER_ID)?.enabled).toBe(false)
  })

  it("re-enables a disabled partner", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners, { enabled: false })

    const updated = await Effect.runPromise(
      setPartnerEnabledUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID, enabled: true }).pipe(
        Effect.provide(testLayers),
      ),
    )

    expect(updated.enabled).toBe(true)
    expect(partners.get(PARTNER_ID)?.enabled).toBe(true)
  })

  it("leaves the secret and the rest of the record alone", async () => {
    const { partners, secrets, testLayers } = createTestLayers()
    seed(partners, { iconUrl: "https://longitude.example/icon.png", allowedIps: ["203.0.113.0/24"] })
    secrets.set(PARTNER_ID, "unchanged-secret")

    const updated = await Effect.runPromise(
      setPartnerEnabledUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID, enabled: false }).pipe(
        Effect.provide(testLayers),
      ),
    )

    expect(updated).toMatchObject({
      name: "Longitude",
      iconUrl: "https://longitude.example/icon.png",
      scopes: ["accounts:provision"],
      allowedIps: ["203.0.113.0/24"],
    })
    expect(secrets.get(PARTNER_ID)).toBe("unchanged-secret")
  })

  it("fails as not found for an unknown partner", async () => {
    const { testLayers } = createTestLayers()

    const exit = await Effect.runPromiseExit(
      setPartnerEnabledUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID, enabled: false }).pipe(
        Effect.provide(testLayers),
      ),
    )

    expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined).toBe(
      "NotFoundError",
    )
  })

  it("publishes AdminPartnerUpdated naming the enabled flag", async () => {
    const { partners, events, testLayers } = createTestLayers()
    seed(partners)

    await Effect.runPromise(
      setPartnerEnabledUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID, enabled: false }).pipe(
        Effect.provide(testLayers),
      ),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "AdminPartnerUpdated",
      aggregateId: PARTNER_ID,
      organizationId: "system",
      payload: { adminUserId: ADMIN_ID, partnerId: PARTNER_ID, name: "Longitude", changes: ["enabled"] },
    })
  })

  it("publishes nothing for an unknown partner", async () => {
    const { events, testLayers } = createTestLayers()

    await Effect.runPromiseExit(
      setPartnerEnabledUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID, enabled: false }).pipe(
        Effect.provide(testLayers),
      ),
    )

    expect(events).toEqual([])
  })
})
