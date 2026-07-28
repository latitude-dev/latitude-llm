import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Organization } from "../entities/organization.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"
import { createFakeOrganizationRepository } from "../testing/index.ts"
import { type UpdateOrganizationInput, updateOrganizationUseCase } from "./update-organization.ts"

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

const run = (org: Organization, input: UpdateOrganizationInput) => {
  const { repository, organizations } = createFakeOrganizationRepository()
  organizations.set(ORG_ID, org)
  return Effect.runPromise(
    updateOrganizationUseCase(input).pipe(
      Effect.provideService(SqlClient, sqlClient),
      Effect.provideService(OrganizationRepository, repository),
    ),
  ).then((updated) => ({ updated, organizations }))
}

const FULL_SETTINGS = {
  keepMonitoring: false,
  billing: { spendingLimitCents: 12_300 },
  wantsShowcase: true,
  redaction: { mode: "enforce" as const, entities: ["email" as const] },
}

describe("updateOrganizationUseCase", () => {
  it("renames without touching settings", async () => {
    const { updated } = await run(seedOrg(FULL_SETTINGS), { name: "Globex" })

    expect(updated.name).toBe("Globex")
    expect(updated.settings).toEqual(FULL_SETTINGS)
  })

  // The web endpoint validates `settings` against a narrow local schema, so Zod
  // strips the keys it doesn't declare. Under a replace that silently wiped
  // billing and showcase state on every rename. This is the shape of T-5.
  it("merges settingsPatch, keeping the keys a narrow caller schema stripped", async () => {
    const { updated, organizations } = await run(seedOrg(FULL_SETTINGS), {
      settingsPatch: { keepMonitoring: true },
    })

    expect(updated.settings).toEqual({ ...FULL_SETTINGS, keepMonitoring: true })
    expect(organizations.get(ORG_ID)?.settings?.billing).toEqual({ spendingLimitCents: 12_300 })
    expect(organizations.get(ORG_ID)?.settings?.wantsShowcase).toBe(true)
  })

  it("merges settingsPatch into null settings without crashing", async () => {
    const { updated } = await run(seedOrg(null), { settingsPatch: { keepMonitoring: true } })

    expect(updated.settings).toEqual({ keepMonitoring: true })
  })

  // `updateSpendingLimitUseCase` clears a limit by rebuilding settings without the
  // key, so replace has to stay available. See T-13.
  it("replaces wholesale when given settings, so a caller can still clear a key", async () => {
    const { updated } = await run(seedOrg(FULL_SETTINGS), { settings: { keepMonitoring: false } })

    // `redaction` survives a replace on purpose — see the bypass tests below.
    expect(updated.settings).toEqual({ keepMonitoring: false, redaction: FULL_SETTINGS.redaction })
  })

  // This endpoint has no role gate and emits no audit event, so letting it write
  // `redaction` would hand every member a way to switch a compliance control off.
  describe("redaction cannot be written through this endpoint", () => {
    it("ignores a redaction patch, keeping the stored policy", async () => {
      const { organizations } = await run(seedOrg(FULL_SETTINGS), {
        settingsPatch: { redaction: { mode: "off", locked: false } },
      })

      expect(organizations.get(ORG_ID)?.settings?.redaction).toEqual(FULL_SETTINGS.redaction)
    })

    it("ignores redaction in a wholesale replace too", async () => {
      const { organizations } = await run(seedOrg(FULL_SETTINGS), {
        settings: { redaction: { mode: "off" } },
      })

      expect(organizations.get(ORG_ID)?.settings?.redaction).toEqual(FULL_SETTINGS.redaction)
    })

    it("does not invent a policy when none is stored", async () => {
      const { organizations } = await run(seedOrg({ keepMonitoring: true }), {
        settingsPatch: { redaction: { mode: "enforce" } },
      })

      expect(organizations.get(ORG_ID)?.settings).toEqual({ keepMonitoring: true })
    })
  })

  it("prefers settingsPatch when a caller passes both", async () => {
    const { updated } = await run(seedOrg(FULL_SETTINGS), {
      settings: { keepMonitoring: false },
      settingsPatch: { wantsShowcase: false },
    })

    expect(updated.settings).toEqual({ ...FULL_SETTINGS, wantsShowcase: false })
  })
})
