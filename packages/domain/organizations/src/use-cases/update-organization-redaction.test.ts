import { OutboxEventWriter, type OutboxWriteEvent } from "@domain/events"
import { OrganizationId, type OrganizationRedactionSetting, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { Organization } from "../entities/organization.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { createFakeOrganizationRepository } from "../testing/index.ts"
import { updateOrganizationRedactionUseCase } from "./update-organization-redaction.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const ACTOR = "uuuuuuuuuuuuuuuuuuuuuuuu"

const sqlClient: SqlClientShape = {
  organizationId: ORG_ID,
  transaction: (effect) => effect,
  query: () => Effect.die(new Error("unexpected query")),
}

const LOCKED: OrganizationRedactionSetting = {
  mode: "enforce",
  entities: ["email", "us_ssn"],
  locked: true,
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

const run = (org: Organization, redaction: OrganizationRedactionSetting | null) => {
  const { repository, organizations } = createFakeOrganizationRepository()
  organizations.set(ORG_ID, org)
  const written: OutboxWriteEvent[] = []
  const layer = Layer.mergeAll(
    Layer.succeed(OrganizationRepository, repository),
    Layer.succeed(SqlClient, sqlClient),
    Layer.succeed(OutboxEventWriter, {
      write: (event) => {
        written.push(event)
        return Effect.void
      },
    }),
  )
  return Effect.runPromise(
    updateOrganizationRedactionUseCase({ actorUserId: ACTOR, redaction }).pipe(Effect.provide(layer)),
  ).then((updated) => ({ updated, organizations, written }))
}

describe("updateOrganizationRedactionUseCase", () => {
  it("sets the policy without clobbering billing or showcase state", async () => {
    const { organizations } = await run(
      seedOrg({ billing: { spendingLimitCents: 12_300 }, wantsShowcase: true }),
      LOCKED,
    )

    expect(organizations.get(ORG_ID)?.settings).toEqual({
      billing: { spendingLimitCents: 12_300 },
      wantsShowcase: true,
      redaction: LOCKED,
    })
  })

  it("removes the org policy when given null", async () => {
    const { organizations } = await run(seedOrg({ redaction: LOCKED, keepMonitoring: false }), null)

    expect(organizations.get(ORG_ID)?.settings).toEqual({ keepMonitoring: false })
  })

  it("records the transition, including the locked flag", async () => {
    const { written } = await run(seedOrg({ redaction: { mode: "enforce", locked: false } }), LOCKED)

    expect(written).toHaveLength(1)
    expect(written[0]?.eventName).toBe("OrganizationRedactionPolicyChanged")
    expect(written[0]?.payload).toEqual({
      organizationId: ORG_ID,
      actorUserId: ACTOR,
      fromRedaction: { mode: "enforce", locked: false },
      toRedaction: LOCKED,
    })
  })

  it("emits nothing when the policy is unchanged", async () => {
    const { written } = await run(seedOrg({ redaction: LOCKED }), { ...LOCKED })

    expect(written).toHaveLength(0)
  })

  // Locking is the whole point of the org layer, so a change to it alone must register.
  it("treats a change to locked alone as a real change", async () => {
    const { written } = await run(seedOrg({ redaction: LOCKED }), { ...LOCKED, locked: false })

    expect(written).toHaveLength(1)
  })

  it("merges into null settings without crashing", async () => {
    const { organizations } = await run(seedOrg(null), LOCKED)

    expect(organizations.get(ORG_ID)?.settings).toEqual({ redaction: LOCKED })
  })
})
