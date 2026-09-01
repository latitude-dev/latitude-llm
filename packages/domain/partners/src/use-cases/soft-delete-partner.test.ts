import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { PartnerId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createPartner } from "../entities/partner.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"
import { createFakePartnerRepository } from "../testing/fake-partner-repository.ts"
import { getPartnerUseCase } from "./get-partner.ts"
import { listPartnersUseCase } from "./list-partners.ts"
import { softDeletePartnerUseCase } from "./soft-delete-partner.ts"

const PARTNER_ID = PartnerId("a".repeat(24))
const ADMIN_ID = "u".repeat(24)

const createTestLayers = () => {
  const { repository, partners } = createFakePartnerRepository()
  const events: OutboxWriteEvent[] = []
  return {
    partners,
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

const seed = (partners: Map<PartnerId, ReturnType<typeof createPartner>>) => {
  const partner = createPartner({
    id: PARTNER_ID,
    name: "Longitude",
    redirectUrls: ["https://longitude.example/oauth/callback"],
    scopes: ["accounts:provision"],
  })
  partners.set(partner.id, partner)
  return partner
}

const failureTag = (exit: Exit.Exit<unknown, { readonly _tag: string }>): string | undefined =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined

describe("softDeletePartnerUseCase", () => {
  it("makes the partner unresolvable afterwards", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners)

    await Effect.runPromise(
      softDeletePartnerUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )
    const exit = await Effect.runPromiseExit(getPartnerUseCase({ id: PARTNER_ID }).pipe(Effect.provide(testLayers)))

    expect(failureTag(exit)).toBe("NotFoundError")
  })

  it("stamps deletedAt rather than dropping the row, so the audit trail survives", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners)

    await Effect.runPromise(
      softDeletePartnerUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )

    expect(partners.has(PARTNER_ID)).toBe(true)
    expect(partners.get(PARTNER_ID)?.deletedAt).toBeInstanceOf(Date)
  })

  it("drops the partner out of the list", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners)

    await Effect.runPromise(
      softDeletePartnerUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )

    expect(await Effect.runPromise(listPartnersUseCase().pipe(Effect.provide(testLayers)))).toEqual([])
  })

  it("fails as not found for an unknown partner, and for a second delete", async () => {
    const { partners, testLayers } = createTestLayers()

    expect(
      failureTag(
        await Effect.runPromiseExit(
          softDeletePartnerUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
        ),
      ),
    ).toBe("NotFoundError")

    seed(partners)
    await Effect.runPromise(
      softDeletePartnerUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )

    expect(
      failureTag(
        await Effect.runPromiseExit(
          softDeletePartnerUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
        ),
      ),
    ).toBe("NotFoundError")
  })

  it("publishes AdminPartnerDeleted alongside the soft delete", async () => {
    const { partners, events, testLayers } = createTestLayers()
    seed(partners)

    await Effect.runPromise(
      softDeletePartnerUseCase({ id: PARTNER_ID, adminUserId: ADMIN_ID }).pipe(Effect.provide(testLayers)),
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventName: "AdminPartnerDeleted",
      aggregateType: "partner",
      aggregateId: PARTNER_ID,
      organizationId: "system",
      payload: { adminUserId: ADMIN_ID, partnerId: PARTNER_ID },
    })
  })
})
