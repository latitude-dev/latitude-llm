import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Organization } from "../entities/organization.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { createFakeOrganizationRepository } from "../testing/index.ts"
import { dismissShowcaseUseCase } from "./dismiss-showcase.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")

const sqlClient: SqlClientShape = {
  organizationId: ORG_ID,
  transaction: (effect) => effect,
  query: () => Effect.die(new Error("unexpected query")),
}

const seedOrg = (settings: Organization["settings"]): Organization => ({
  id: ORG_ID,
  name: "Acme",
  slug: "acme",
  logo: null,
  metadata: null,
  settings,
  parentOrgId: null,
  expiresAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
})

const run = (org: Organization) => {
  const { repository, organizations } = createFakeOrganizationRepository()
  organizations.set(ORG_ID, org)
  return Effect.runPromise(
    dismissShowcaseUseCase({ actorUserId: "uuuuuuuuuuuuuuuuuuuuuuuu" }).pipe(
      Effect.provideService(SqlClient, sqlClient),
      Effect.provideService(OrganizationRepository, repository),
    ),
  ).then((updated) => ({ updated, organizations }))
}

describe("dismissShowcaseUseCase", () => {
  it("flips the requesting org's wantsShowcase flag to false", async () => {
    const { updated, organizations } = await run(seedOrg({ wantsShowcase: true }))

    expect(updated.settings?.wantsShowcase).toBe(false)
    expect(organizations.get(ORG_ID)?.settings?.wantsShowcase).toBe(false)
  })

  it("preserves other org settings", async () => {
    const { updated } = await run(seedOrg({ wantsShowcase: true, billing: { spendingLimitCents: 5000 } }))

    expect(updated.settings?.wantsShowcase).toBe(false)
    expect(updated.settings?.billing).toEqual({ spendingLimitCents: 5000 })
  })

  it("is a harmless no-op when already dismissed", async () => {
    const { updated } = await run(seedOrg({ wantsShowcase: false }))

    expect(updated.settings?.wantsShowcase).toBe(false)
  })

  it("initializes settings when currently null (spreading null is a no-op, not a crash)", async () => {
    const { updated } = await run(seedOrg(null))

    expect(updated.settings).toEqual({ wantsShowcase: false })
  })
})
