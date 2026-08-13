import {
  claimGithubInstallationUseCase,
  GithubIntegrationConflictError,
  GithubIntegrationRepository,
  GithubSyncConfigRepository,
  syncGithubInstallationUseCase,
} from "@domain/github"
import { OrganizationId, type SqlClient, UserId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { githubDeliveries } from "../schema/github-deliveries.ts"
import { githubIntegrationDetails } from "../schema/github-integration-details.ts"
import { githubSyncConfigs } from "../schema/github-sync-configs.ts"
import { integrations } from "../schema/integrations.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import {
  findActiveGithubInstallationAcrossOrgs,
  GithubIntegrationRepositoryLive,
} from "./github-integration-repository.ts"
import { GithubSyncConfigRepositoryLive } from "./github-sync-config-repository.ts"

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const USER = UserId("d".repeat(24))

const pg = setupTestPostgres()

const lifecycleLayer = Layer.mergeAll(GithubIntegrationRepositoryLive, GithubSyncConfigRepositoryLive)

const run = <A, E>(
  org: OrganizationId,
  effect: Effect.Effect<A, E, GithubIntegrationRepository | GithubSyncConfigRepository | SqlClient>,
) => Effect.runPromise(effect.pipe(withPostgres(lifecycleLayer, pg.adminPostgresClient, org)))

const claim = (org: OrganizationId, installationId: number) =>
  claimGithubInstallationUseCase({
    organizationId: org,
    installedByUserId: USER,
    installationId,
    accountLogin: "acme",
    accountType: "Organization",
    repositorySelection: "all",
  })

afterEach(async () => {
  await pg.db.delete(githubDeliveries)
  await pg.db.delete(githubSyncConfigs)
  await pg.db.delete(githubIntegrationDetails)
  await pg.db.delete(integrations)
})

describe("GithubIntegrationRepositoryLive + claim lifecycle", () => {
  it("claims an installation and seeds the org-default sync config", async () => {
    const integration = await run(ORG_A, claim(ORG_A, 101))
    expect(integration.installationId).toBe(101)
    expect(integration.accountLogin).toBe("acme")

    const active = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }),
    )
    expect(active?.id).toBe(integration.id)

    const orgDefault = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubSyncConfigRepository
        return yield* repo.findDefaultByIntegration(integration.id)
      }),
    )
    expect(orgDefault?.projectId).toBeNull()
    expect(orgDefault?.monitorPullRequests).toBe(true)
    expect(orgDefault?.monitorCommits).toBe(true)
    expect(orgDefault?.sources).toEqual({ commitMessage: true, branchName: true, prTitle: true, prBody: true })
    expect(orgDefault?.rules?.resolveKeywords).toContain("fixes")
    expect(orgDefault?.rules?.unresolveKeywords).toContain("reverts")
  })

  it("rejects claiming an installation already claimed by another org (cross-org unique)", async () => {
    await run(ORG_B, claim(ORG_B, 202))

    const error = await Effect.runPromise(
      claim(ORG_A, 202).pipe(withPostgres(lifecycleLayer, pg.adminPostgresClient, ORG_A), Effect.flip),
    )
    expect(error).toBeInstanceOf(GithubIntegrationConflictError)
  })

  it("resolves an installation id to its claimed org across orgs (webhook routing)", async () => {
    const integration = await run(ORG_A, claim(ORG_A, 303))

    const resolved = await Effect.runPromise(findActiveGithubInstallationAcrossOrgs(pg.adminPostgresClient.db, 303))
    expect(resolved?.id).toBe(integration.id)
    expect(resolved?.organizationId).toBe(ORG_A)

    const missing = await Effect.runPromise(findActiveGithubInstallationAcrossOrgs(pg.adminPostgresClient.db, 999))
    expect(missing).toBeNull()
  })

  it("applies suspend, unsuspend, metadata refresh, and revoke", async () => {
    const integration = await run(ORG_A, claim(ORG_A, 404))

    const applyChange = (change: Parameters<typeof syncGithubInstallationUseCase>[0]["change"]) =>
      run(ORG_A, syncGithubInstallationUseCase({ integrationId: integration.id, change }))

    expect(await applyChange({ kind: "suspended", suspendedAt: new Date() })).toBe(true)
    const afterSuspend = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }),
    )
    expect(afterSuspend?.suspendedAt).not.toBeNull()

    expect(await applyChange({ kind: "unsuspended" })).toBe(true)
    expect(
      await applyChange({
        kind: "metadata",
        accountLogin: "acme-renamed",
        accountType: "User",
        repositorySelection: "selected",
      }),
    ).toBe(true)

    const afterMetadata = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }),
    )
    expect(afterMetadata?.accountLogin).toBe("acme-renamed")
    expect(afterMetadata?.accountType).toBe("User")
    expect(afterMetadata?.repositorySelection).toBe("selected")
    expect(afterMetadata?.suspendedAt).toBeNull()

    expect(await applyChange({ kind: "revoked" })).toBe(true)
    const afterRevoke = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }),
    )
    expect(afterRevoke).toBeNull()
  })

  it("re-claims an installation for the same org after revoke", async () => {
    const first = await run(ORG_A, claim(ORG_A, 505))
    await run(ORG_A, syncGithubInstallationUseCase({ integrationId: first.id, change: { kind: "revoked" } }))

    const second = await run(ORG_A, claim(ORG_A, 505))
    expect(second.id).not.toBe(first.id)
    expect(second.revokedAt).toBeNull()
  })
})
