import { PartnerId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Cause, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createPartner } from "../entities/partner.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"
import { createFakePartnerRepository } from "../testing/fake-partner-repository.ts"
import { getPartnerUseCase } from "./get-partner.ts"

const PARTNER_ID = PartnerId("a".repeat(24))

const createTestLayers = () => {
  const { repository, partners } = createFakePartnerRepository()
  return {
    partners,
    testLayers: Layer.mergeAll(
      Layer.succeed(PartnerRepository, repository),
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

const failureTag = (exit: Exit.Exit<unknown, { readonly _tag: string }>): string | undefined =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error._tag : undefined

describe("getPartnerUseCase", () => {
  it("returns the partner, secret excluded", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners)

    const partner = await Effect.runPromise(getPartnerUseCase({ id: PARTNER_ID }).pipe(Effect.provide(testLayers)))

    expect(partner).toMatchObject({ id: PARTNER_ID, name: "Longitude" })
    expect(partner).not.toHaveProperty("hmacSecret")
  })

  it("resolves a disabled partner, so staff can still see and re-enable it", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners, { enabled: false })

    const partner = await Effect.runPromise(getPartnerUseCase({ id: PARTNER_ID }).pipe(Effect.provide(testLayers)))

    expect(partner.enabled).toBe(false)
  })

  it("fails as not found for an unknown partner", async () => {
    const { testLayers } = createTestLayers()

    const exit = await Effect.runPromiseExit(getPartnerUseCase({ id: PARTNER_ID }).pipe(Effect.provide(testLayers)))

    expect(failureTag(exit)).toBe("NotFoundError")
  })

  it("fails as not found for a soft-deleted partner", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners, { deletedAt: new Date("2026-01-01") })

    const exit = await Effect.runPromiseExit(getPartnerUseCase({ id: PARTNER_ID }).pipe(Effect.provide(testLayers)))

    expect(failureTag(exit)).toBe("NotFoundError")
  })
})
