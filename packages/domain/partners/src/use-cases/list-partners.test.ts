import { PartnerId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { createPartner } from "../entities/partner.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"
import { createFakePartnerRepository } from "../testing/fake-partner-repository.ts"
import { listPartnersUseCase } from "./list-partners.ts"

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
    name: "Longitude",
    redirectUrls: ["https://longitude.example/oauth/callback"],
    scopes: ["accounts:provision"],
    ...overrides,
  })
  partners.set(partner.id, partner)
  return partner
}

describe("listPartnersUseCase", () => {
  it("returns an empty list when nothing is registered", async () => {
    const { testLayers } = createTestLayers()

    expect(await Effect.runPromise(listPartnersUseCase().pipe(Effect.provide(testLayers)))).toEqual([])
  })

  it("returns live partners newest first", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners, { id: PartnerId("b".repeat(24)), name: "Older", createdAt: new Date("2026-01-01") })
    seed(partners, { id: PartnerId("c".repeat(24)), name: "Newer", createdAt: new Date("2026-02-01") })

    const listed = await Effect.runPromise(listPartnersUseCase().pipe(Effect.provide(testLayers)))

    expect(listed.map((partner) => partner.name)).toEqual(["Newer", "Older"])
  })

  it("includes disabled partners but excludes soft-deleted ones", async () => {
    const { partners, testLayers } = createTestLayers()
    seed(partners, { id: PartnerId("b".repeat(24)), name: "Disabled", enabled: false })
    seed(partners, { id: PartnerId("d".repeat(24)), name: "Gone", deletedAt: new Date("2026-03-01") })

    const listed = await Effect.runPromise(listPartnersUseCase().pipe(Effect.provide(testLayers)))

    expect(listed.map((partner) => partner.name)).toEqual(["Disabled"])
  })
})
