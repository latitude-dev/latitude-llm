import {
  claimGithubInstallationUseCase,
  type GithubIntegrationRepository,
  GithubSyncConfigRepository,
  resetGithubProjectOverrideUseCase,
  updateGithubOrgDefaultsUseCase,
  upsertGithubSyncConfigUseCase,
} from "@domain/github"
import { OrganizationId, ProjectId, type SqlClient, UserId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { githubDeliveries } from "../schema/github-deliveries.ts"
import { githubIntegrationDetails } from "../schema/github-integration-details.ts"
import { githubSyncConfigs } from "../schema/github-sync-configs.ts"
import { integrations } from "../schema/integrations.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { GithubIntegrationRepositoryLive } from "./github-integration-repository.ts"
import { GithubSyncConfigRepositoryLive } from "./github-sync-config-repository.ts"

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))
const USER = UserId("d".repeat(24))
const PROJECT = ProjectId("c".repeat(24))

const pg = setupTestPostgres()
const layer = Layer.mergeAll(GithubIntegrationRepositoryLive, GithubSyncConfigRepositoryLive)

const run = <A, E>(
  org: OrganizationId,
  effect: Effect.Effect<A, E, GithubIntegrationRepository | GithubSyncConfigRepository | SqlClient>,
) => Effect.runPromise(effect.pipe(withPostgres(layer, pg.adminPostgresClient, org)))

const allowedRepos = [{ id: 100, fullName: "acme/api", defaultBranch: "main" }] as const

const claim = (org: OrganizationId, installationId: number) =>
  run(
    org,
    claimGithubInstallationUseCase({
      organizationId: org,
      installedByUserId: USER,
      installationId,
      accountLogin: "acme",
      accountType: "Organization",
      repositorySelection: "all",
    }),
  )

afterEach(async () => {
  await pg.db.delete(githubDeliveries)
  await pg.db.delete(githubSyncConfigs)
  await pg.db.delete(githubIntegrationDetails)
  await pg.db.delete(integrations)
})

describe("GithubSyncConfigRepositoryLive config editing", () => {
  it("updates the org-default row in place through updateGithubOrgDefaults", async () => {
    const integration = await claim(ORG_A, 100)

    await run(
      ORG_A,
      updateGithubOrgDefaultsUseCase({
        organizationId: ORG_A,
        integrationId: integration.id,
        settings: {
          monitorPullRequests: false,
          monitorCommits: true,
          sources: { commitMessage: true, branchName: true, prTitle: false, prBody: false },
          rules: { resolveKeywords: ["ship"], unresolveKeywords: [], referenceKeywords: [] },
        },
        defaultRepo: { repoId: 100, branch: "main" },
        allowedRepos,
      }),
    )

    const orgDefault = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubSyncConfigRepository
        return yield* repo.findDefaultByIntegration(integration.id)
      }),
    )
    expect(orgDefault?.monitorPullRequests).toBe(false)
    expect(orgDefault?.rules?.resolveKeywords).toEqual(["ship"])
    expect(orgDefault?.repoId).toBe(100)
    expect(orgDefault?.branch).toBe("main")
    const rows = await pg.db.select().from(githubSyncConfigs)
    expect(rows.filter((r) => r.projectId === null)).toHaveLength(1)
  })

  it("creates, replaces, reads, and resets a project's single override", async () => {
    const integration = await claim(ORG_A, 100)

    const created = await run(
      ORG_A,
      upsertGithubSyncConfigUseCase({
        organizationId: ORG_A,
        projectId: PROJECT,
        integrationId: integration.id,
        repoId: 100,
        branch: "main",
        allowedRepos,
      }),
    )
    expect(created.repoFullName).toBe("acme/api")

    const again = await run(
      ORG_A,
      upsertGithubSyncConfigUseCase({
        organizationId: ORG_A,
        projectId: PROJECT,
        integrationId: integration.id,
        repoId: 100,
        branch: "main",
        enabled: false,
        allowedRepos,
      }),
    )
    expect(again.id).toBe(created.id)
    expect(again.enabled).toBe(false)

    const found = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubSyncConfigRepository
        return yield* repo.findByProject(integration.id, PROJECT)
      }),
    )
    expect(found?.id).toBe(created.id)

    await run(ORG_A, resetGithubProjectOverrideUseCase({ projectId: PROJECT }))
    const afterReset = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubSyncConfigRepository
        return yield* repo.findByProject(integration.id, PROJECT)
      }),
    )
    expect(afterReset).toBeNull()
  })

  it("never deletes the org-default row through a project reset", async () => {
    const integration = await claim(ORG_A, 100)
    const orgDefault = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubSyncConfigRepository
        return yield* repo.findDefaultByIntegration(integration.id)
      }),
    )

    await run(ORG_A, resetGithubProjectOverrideUseCase({ projectId: PROJECT }))
    const stillThere = await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubSyncConfigRepository
        return yield* repo.findDefaultByIntegration(integration.id)
      }),
    )
    expect(stillThere?.id).toBe(orgDefault?.id)
  })

  it("isolates project bindings by organization (RLS)", async () => {
    const integration = await claim(ORG_A, 100)
    const created = await run(
      ORG_A,
      upsertGithubSyncConfigUseCase({
        organizationId: ORG_A,
        projectId: PROJECT,
        integrationId: integration.id,
        repoId: 100,
        branch: "main",
        allowedRepos,
      }),
    )

    const fromOrgB = await run(
      ORG_B,
      Effect.gen(function* () {
        const repo = yield* GithubSyncConfigRepository
        return yield* repo.findById(created.id)
      }),
    )
    expect(fromOrgB).toBeNull()
  })

  it("scopes webhook config routing to the integration, excluding a reclaimed installation's rows", async () => {
    const first = await claim(ORG_A, 100)
    await run(
      ORG_A,
      upsertGithubSyncConfigUseCase({
        organizationId: ORG_A,
        projectId: PROJECT,
        integrationId: first.id,
        repoId: 100,
        branch: "main",
        allowedRepos,
      }),
    )
    // Reclaiming the installation soft-revokes `first` and creates a new integration;
    // `first`'s enabled project row stays in the table and must not leak to the new one.
    const reclaimed = await claim(ORG_A, 200)
    expect(reclaimed.id).not.toBe(first.id)

    const listFor = (integrationId: string) =>
      run(
        ORG_A,
        Effect.gen(function* () {
          const repo = yield* GithubSyncConfigRepository
          return yield* repo.listByOrganizationRepo(integrationId, 100)
        }),
      )

    expect(await listFor(reclaimed.id)).toHaveLength(0)
    expect(await listFor(first.id)).toHaveLength(1)
  })

  it("scopes findByProject to the integration and deletes overrides across integrations", async () => {
    const first = await claim(ORG_A, 100)
    const upsertFor = (integrationId: string) =>
      run(
        ORG_A,
        upsertGithubSyncConfigUseCase({
          organizationId: ORG_A,
          projectId: PROJECT,
          integrationId,
          repoId: 100,
          branch: "main",
          allowedRepos,
        }),
      )
    await upsertFor(first.id)
    const reclaimed = await claim(ORG_A, 200)

    const findFor = (integrationId: string) =>
      run(
        ORG_A,
        Effect.gen(function* () {
          const repo = yield* GithubSyncConfigRepository
          return yield* repo.findByProject(integrationId, PROJECT)
        }),
      )
    // The reclaimed installation sees no override; the original's row stays but is scoped out.
    expect(await findFor(reclaimed.id)).toBeNull()
    expect((await findFor(first.id))?.integrationId).toBe(first.id)

    // A second override under the reclaimed installation coexists (one row per integration)...
    await upsertFor(reclaimed.id)
    const projectRows = async () =>
      (await pg.db.select().from(githubSyncConfigs)).filter((r) => r.projectId === PROJECT)
    expect(await projectRows()).toHaveLength(2)

    // ...and deleteByProject clears every integration's row (reset / ProjectDeleted cascade).
    await run(
      ORG_A,
      Effect.gen(function* () {
        const repo = yield* GithubSyncConfigRepository
        yield* repo.deleteByProject(PROJECT)
      }),
    )
    expect(await projectRows()).toHaveLength(0)
  })
})
