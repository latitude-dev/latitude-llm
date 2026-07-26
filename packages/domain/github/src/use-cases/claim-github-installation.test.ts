import { generateId, OrganizationId, SqlClient, UserId } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { GithubIntegration } from "../entities/github-integration.ts"
import { GithubIntegrationConflictError } from "../errors.ts"
import { GithubIntegrationRepository, GithubSyncConfigRepository } from "../ports/repositories.ts"
import { createFakeGithubIntegrationRepository } from "../testing/fake-github-integration-repository.ts"
import { createFakeGithubSyncConfigRepository } from "../testing/fake-github-sync-config-repository.ts"
import { claimGithubInstallationUseCase } from "./claim-github-installation.ts"

const ORG_A = OrganizationId(generateId())
const ORG_B = OrganizationId(generateId())
const USER = UserId(generateId())

const makeLayer = (init: {
  readonly organizationId: OrganizationId
  readonly integrationSeed?: readonly GithubIntegration[]
}) => {
  const integration = createFakeGithubIntegrationRepository({
    organizationId: init.organizationId,
    ...(init.integrationSeed ? { seed: init.integrationSeed } : {}),
  })
  const syncConfig = createFakeGithubSyncConfigRepository({ organizationId: init.organizationId })
  const layer = Layer.mergeAll(
    Layer.succeed(GithubIntegrationRepository, integration.repository),
    Layer.succeed(GithubSyncConfigRepository, syncConfig.repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: init.organizationId })),
  )
  return { layer, integration, syncConfig }
}

const claimInput = (organizationId: OrganizationId, installationId: number) => ({
  organizationId,
  installedByUserId: USER,
  installationId,
  accountLogin: "acme",
  accountType: "Organization" as const,
  repositorySelection: "all" as const,
})

describe("claimGithubInstallationUseCase", () => {
  it("inserts the integration and seeds the org-default sync config with built-in defaults", async () => {
    const { layer, integration, syncConfig } = makeLayer({ organizationId: ORG_A })

    const result = await Effect.runPromise(
      claimGithubInstallationUseCase(claimInput(ORG_A, 111)).pipe(Effect.provide(layer)),
    )

    expect(result.installationId).toBe(111)
    expect(integration.rows.size).toBe(1)

    const defaults = [...syncConfig.rows.values()]
    expect(defaults).toHaveLength(1)
    expect(defaults[0]?.projectId).toBeNull()
    expect(defaults[0]?.monitorPullRequests).toBe(true)
    expect(defaults[0]?.rules?.resolveKeywords).toContain("fixes")
    expect(defaults[0]?.integrationId).toBe(result.id)
  })

  it("rejects claiming an installation already active in another organization", async () => {
    const existing: GithubIntegration = {
      id: generateId(),
      organizationId: ORG_B,
      installationId: 222,
      accountLogin: "other",
      accountType: "Organization",
      repositorySelection: "all",
      suspendedAt: null,
      installedByUserId: USER,
      installedAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const { layer } = makeLayer({ organizationId: ORG_A, integrationSeed: [existing] })

    const error = await Effect.runPromise(
      claimGithubInstallationUseCase(claimInput(ORG_A, 222)).pipe(Effect.provide(layer), Effect.flip),
    )
    expect(error).toBeInstanceOf(GithubIntegrationConflictError)
  })

  it("soft-revokes a prior active integration before inserting the new one", async () => {
    const prior: GithubIntegration = {
      id: generateId(),
      organizationId: ORG_A,
      installationId: 333,
      accountLogin: "acme",
      accountType: "Organization",
      repositorySelection: "all",
      suspendedAt: null,
      installedByUserId: USER,
      installedAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const { layer, integration } = makeLayer({ organizationId: ORG_A, integrationSeed: [prior] })

    await Effect.runPromise(claimGithubInstallationUseCase(claimInput(ORG_A, 444)).pipe(Effect.provide(layer)))

    expect(integration.rows.get(prior.id)?.revokedAt).not.toBeNull()
    const active = [...integration.rows.values()].filter((r) => r.revokedAt === null)
    expect(active).toHaveLength(1)
    expect(active[0]?.installationId).toBe(444)
  })
})
