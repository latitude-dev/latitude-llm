import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { PartnerId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { PARTNER_SECRET_LENGTH } from "../constants.ts"
import { createPartner } from "../entities/partner.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"
import { createFakePartnerRepository } from "../testing/fake-partner-repository.ts"
import { rotatePartnerSecretUseCase } from "./rotate-partner-secret.ts"

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

describe("rotatePartnerSecretUseCase", () => {
  it("hard-swaps the secret so the previous one stops verifying", async () => {
    const { partners, secrets, testLayers } = createTestLayers()
    seed(partners)
    secrets.set(PARTNER_ID, "old-secret")

    const { rawSecret } = await Effect.runPromise(
      rotatePartnerSecretUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )

    expect(rawSecret).toHaveLength(PARTNER_SECRET_LENGTH)
    expect(rawSecret).not.toBe("old-secret")
    expect(secrets.get(PARTNER_ID)).toBe(rawSecret)
  })

  it("returns a different secret on every rotation", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners)

    const first = await Effect.runPromise(
      rotatePartnerSecretUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )
    const second = await Effect.runPromise(
      rotatePartnerSecretUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )

    expect(first.rawSecret).not.toBe(second.rawSecret)
  })

  it("leaves every other field untouched", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners, { iconUrl: "https://longitude.example/icon.png", enabled: false })

    const { partner } = await Effect.runPromise(
      rotatePartnerSecretUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )

    expect(partner).toMatchObject({
      name: "Longitude",
      iconUrl: "https://longitude.example/icon.png",
      scopes: ["accounts:provision"],
      enabled: false,
    })
  })

  it("fails as not found for an unknown partner", async () => {
    const { testLayers } = createTestLayers()

    const exit = await Effect.runPromiseExit(
      rotatePartnerSecretUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )

    expect(Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined).toBe(
      "NotFoundError",
    )
  })

  it("publishes AdminPartnerUpdated naming the secret, never its value", async () => {
    const { partners, events, testLayers } = createTestLayers()
    seed(partners)

    const { rawSecret } = await Effect.runPromise(
      rotatePartnerSecretUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "AdminPartnerUpdated",
      aggregateId: PARTNER_ID,
      organizationId: "system",
      payload: { adminUserId: ADMIN_ID, partnerId: PARTNER_ID, name: "Longitude", changes: ["hmacSecret"] },
    })
    expect(JSON.stringify(events[0])).not.toContain(rawSecret)
  })
})
