import { generateId, OrganizationId, ProjectId, SqlClient } from "@domain/shared"
import { createFakeSqlClient } from "@domain/shared/testing"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_GITHUB_MONITOR_SETTINGS, type GithubSyncConfigRow } from "../entities/github-sync-config.ts"
import { GithubRepoNotInInstallationError } from "../errors.ts"
import { GithubSyncConfigRepository } from "../ports/repositories.ts"
import { createFakeGithubSyncConfigRepository } from "../testing/fake-github-sync-config-repository.ts"
import { resetGithubProjectOverrideUseCase } from "./reset-github-project-override.ts"
import { updateGithubOrgDefaultsUseCase } from "./update-github-org-defaults.ts"
import type { AllowedGithubRepo } from "./upsert-github-sync-config.ts"
import { upsertGithubSyncConfigUseCase } from "./upsert-github-sync-config.ts"

const ORG = OrganizationId(generateId())
const PROJECT = ProjectId(generateId())
const OTHER_PROJECT = ProjectId(generateId())
const INTEGRATION = generateId()

const ALLOWED: readonly AllowedGithubRepo[] = [
  { id: 100, fullName: "acme/api", defaultBranch: "main" },
  { id: 200, fullName: "acme/web", defaultBranch: "trunk" },
]

const orgDefaultRow = (): GithubSyncConfigRow => ({
  id: generateId(),
  organizationId: ORG,
  projectId: null,
  integrationId: INTEGRATION,
  repoId: null,
  repoFullName: null,
  branch: null,
  enabled: true,
  monitorPullRequests: DEFAULT_GITHUB_MONITOR_SETTINGS.monitorPullRequests,
  monitorCommits: DEFAULT_GITHUB_MONITOR_SETTINGS.monitorCommits,
  sources: DEFAULT_GITHUB_MONITOR_SETTINGS.sources,
  rules: DEFAULT_GITHUB_MONITOR_SETTINGS.rules,
  createdAt: new Date(),
  updatedAt: new Date(),
})

let syncConfig: ReturnType<typeof createFakeGithubSyncConfigRepository>
let layer: Layer.Layer<GithubSyncConfigRepository | SqlClient>

beforeEach(() => {
  syncConfig = createFakeGithubSyncConfigRepository({ organizationId: ORG, seed: [orgDefaultRow()] })
  layer = Layer.mergeAll(
    Layer.succeed(GithubSyncConfigRepository, syncConfig.repository),
    Layer.succeed(SqlClient, createFakeSqlClient({ organizationId: ORG })),
  )
})

const run = <A, E>(effect: Effect.Effect<A, E, GithubSyncConfigRepository | SqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer)))

const SETTINGS = {
  monitorPullRequests: false,
  monitorCommits: true,
  sources: { commitMessage: true, branchName: false, prTitle: false, prBody: false },
  rules: { resolveKeywords: ["ship"], unresolveKeywords: [], referenceKeywords: [] },
}

describe("updateGithubOrgDefaultsUseCase", () => {
  it("re-materializes behavior and the default repo on the org-default row", async () => {
    const updated = await run(
      updateGithubOrgDefaultsUseCase({
        organizationId: ORG,
        integrationId: INTEGRATION,
        settings: SETTINGS,
        defaultRepo: { repoId: 100, branch: "main" },
        allowedRepos: ALLOWED,
      }),
    )

    expect(updated.projectId).toBeNull()
    expect(updated.monitorPullRequests).toBe(false)
    expect(updated.sources).toEqual({ commitMessage: true, branchName: false, prTitle: false, prBody: false })
    expect(updated.repoId).toBe(100)
    expect(updated.repoFullName).toBe("acme/api")
    expect(updated.branch).toBe("main")
    const defaults = [...syncConfig.rows.values()].filter((r) => r.projectId === null)
    expect(defaults).toHaveLength(1)
  })

  it("falls back to the repo's default branch when branch is blank", async () => {
    const updated = await run(
      updateGithubOrgDefaultsUseCase({
        organizationId: ORG,
        integrationId: INTEGRATION,
        settings: SETTINGS,
        defaultRepo: { repoId: 200, branch: "" },
        allowedRepos: ALLOWED,
      }),
    )
    expect(updated.branch).toBe("trunk")
  })

  it("rejects a default repo the installation cannot see (D13)", async () => {
    const error = await run(
      updateGithubOrgDefaultsUseCase({
        organizationId: ORG,
        integrationId: INTEGRATION,
        settings: SETTINGS,
        defaultRepo: { repoId: 999, branch: "main" },
        allowedRepos: ALLOWED,
      }).pipe(Effect.flip),
    )
    expect(error).toBeInstanceOf(GithubRepoNotInInstallationError)
  })

  it("clears the default repo when defaultRepo is null (behavior still saved)", async () => {
    await run(
      updateGithubOrgDefaultsUseCase({
        organizationId: ORG,
        integrationId: INTEGRATION,
        settings: SETTINGS,
        defaultRepo: { repoId: 100, branch: "main" },
        allowedRepos: ALLOWED,
      }),
    )
    const cleared = await run(
      updateGithubOrgDefaultsUseCase({
        organizationId: ORG,
        integrationId: INTEGRATION,
        settings: SETTINGS,
        defaultRepo: null,
        allowedRepos: [],
      }),
    )
    expect(cleared.repoId).toBeNull()
    expect(cleared.repoFullName).toBeNull()
    expect(cleared.branch).toBeNull()
    expect(cleared.rules?.resolveKeywords).toEqual(["ship"])
  })
})

describe("upsertGithubSyncConfigUseCase", () => {
  it("creates a project binding with repoFullName from the installation, not client input", async () => {
    const row = await run(
      upsertGithubSyncConfigUseCase({
        organizationId: ORG,
        projectId: PROJECT,
        integrationId: INTEGRATION,
        repoId: 100,
        branch: "main",
        allowedRepos: ALLOWED,
      }),
    )
    expect(row.repoFullName).toBe("acme/api")
    expect(row.branch).toBe("main")
    expect(row.enabled).toBe(true)
    expect(row.monitorPullRequests).toBeNull()
  })

  it("rejects a repo the installation cannot see (D13)", async () => {
    const error = await run(
      upsertGithubSyncConfigUseCase({
        organizationId: ORG,
        projectId: PROJECT,
        integrationId: INTEGRATION,
        repoId: 999,
        branch: "main",
        allowedRepos: ALLOWED,
      }).pipe(Effect.flip),
    )
    expect(error).toBeInstanceOf(GithubRepoNotInInstallationError)
  })

  it("keeps a single override per project, replacing repo/branch/behavior on re-upsert", async () => {
    const first = await run(
      upsertGithubSyncConfigUseCase({
        organizationId: ORG,
        projectId: PROJECT,
        integrationId: INTEGRATION,
        repoId: 100,
        branch: "main",
        allowedRepos: ALLOWED,
      }),
    )
    const second = await run(
      upsertGithubSyncConfigUseCase({
        organizationId: ORG,
        projectId: PROJECT,
        integrationId: INTEGRATION,
        repoId: 200,
        branch: "trunk",
        enabled: false,
        monitorCommits: false,
        allowedRepos: ALLOWED,
      }),
    )
    expect(second.id).toBe(first.id)
    expect(second.repoId).toBe(200)
    expect(second.branch).toBe("trunk")
    expect(second.enabled).toBe(false)
    const bindings = [...syncConfig.rows.values()].filter((r) => r.projectId === PROJECT)
    expect(bindings).toHaveLength(1)
  })

  it("lets multiple projects point at the same repo (monorepo)", async () => {
    await run(
      upsertGithubSyncConfigUseCase({
        organizationId: ORG,
        projectId: PROJECT,
        integrationId: INTEGRATION,
        repoId: 100,
        branch: "main",
        allowedRepos: ALLOWED,
      }),
    )
    await run(
      upsertGithubSyncConfigUseCase({
        organizationId: ORG,
        projectId: OTHER_PROJECT,
        integrationId: INTEGRATION,
        repoId: 100,
        branch: "main",
        allowedRepos: ALLOWED,
      }),
    )
    const bindings = [...syncConfig.rows.values()].filter((r) => r.repoId === 100 && r.projectId !== null)
    expect(bindings).toHaveLength(2)
  })
})

describe("resetGithubProjectOverrideUseCase", () => {
  it("removes a project's override but never the org-default row", async () => {
    const row = await run(
      upsertGithubSyncConfigUseCase({
        organizationId: ORG,
        projectId: PROJECT,
        integrationId: INTEGRATION,
        repoId: 100,
        branch: "main",
        allowedRepos: ALLOWED,
      }),
    )
    const orgDefaultId = [...syncConfig.rows.values()].find((r) => r.projectId === null)?.id ?? ""

    await run(resetGithubProjectOverrideUseCase({ projectId: PROJECT }))
    expect([...syncConfig.rows.values()].some((r) => r.id === row.id)).toBe(false)
    expect([...syncConfig.rows.values()].some((r) => r.id === orgDefaultId)).toBe(true)
  })

  it("is a no-op when the project has no override", async () => {
    await run(resetGithubProjectOverrideUseCase({ projectId: OTHER_PROJECT }))
    const orgDefaults = [...syncConfig.rows.values()].filter((r) => r.projectId === null)
    expect(orgDefaults).toHaveLength(1)
  })
})
