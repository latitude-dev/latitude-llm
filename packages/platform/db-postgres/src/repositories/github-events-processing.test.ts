import {
  claimGithubInstallationUseCase,
  deleteGithubProjectDataUseCase,
  type ProcessGithubPullRequestInput,
  type ProcessGithubPushInput,
  processGithubPullRequestUseCase,
  processGithubPushUseCase,
} from "@domain/github"
import { OrganizationId, ProjectId, type SqlClient, UserId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import { OutboxEventWriterLive } from "../outbox-writer.ts"
import { githubDeliveries } from "../schema/github-deliveries.ts"
import { githubIntegrationDetails } from "../schema/github-integration-details.ts"
import { githubSignalReferences } from "../schema/github-signal-references.ts"
import { githubSyncConfigs } from "../schema/github-sync-configs.ts"
import { integrations } from "../schema/integrations.ts"
import { projects } from "../schema/projects.ts"
import { signals } from "../schema/signals.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { EvaluationRepositoryLive } from "./evaluation-repository.ts"
import { GithubDeliveryRepositoryLive } from "./github-delivery-repository.ts"
import { GithubIntegrationRepositoryLive } from "./github-integration-repository.ts"
import { GithubSignalReferenceRepositoryLive } from "./github-signal-reference-repository.ts"
import { GithubSyncConfigRepositoryLive } from "./github-sync-config-repository.ts"
import { ProjectRepositoryLive } from "./project-repository.ts"
import { SettingsReaderLive } from "./settings-reader-repository.ts"
import { SignalRepositoryLive } from "./signal-repository.ts"

const ORG = OrganizationId("g".repeat(24))
const USER = UserId("u".repeat(24))
const PROJECT = ProjectId("p".repeat(24))
const INSTALLATION_ID = 7700
const REPO_ID = 4242

const pg = setupTestPostgres()

const layer = Layer.mergeAll(
  GithubIntegrationRepositoryLive,
  GithubSyncConfigRepositoryLive,
  GithubDeliveryRepositoryLive,
  GithubSignalReferenceRepositoryLive,
  SignalRepositoryLive,
  EvaluationRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  ProjectRepositoryLive,
)

type LayerOut<L> = L extends Layer.Layer<infer ROut, infer _E, infer _RIn> ? ROut : never

const inOrg = <A, E>(effect: Effect.Effect<A, E, LayerOut<typeof layer> | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(layer, pg.adminPostgresClient, ORG)))

const seedProject = (id: ProjectId, slug: string) =>
  pg.db.insert(projects).values({ id, organizationId: ORG, name: slug, slug })

const seedSignal = (id: string, projectId: ProjectId, slug: string) =>
  pg.db.insert(signals).values({
    id,
    organizationId: ORG,
    projectId,
    slug,
    name: slug,
    description: `${slug} description`,
    source: "custom",
    origin: "user",
  })

const seedRepoConfig = (integrationId: string, projectId: ProjectId, branch = "main") =>
  pg.db.insert(githubSyncConfigs).values({
    organizationId: ORG,
    projectId,
    integrationId,
    repoId: REPO_ID,
    repoFullName: "acme/app",
    branch,
    enabled: true,
  })

const prInput = (overrides: Partial<ProcessGithubPullRequestInput>): ProcessGithubPullRequestInput => ({
  organizationId: ORG,
  integrationId: "",
  deliveryId: "delivery",
  repoId: REPO_ID,
  repoFullName: "acme/app",
  action: "opened",
  prNumber: 7,
  title: "Fixes LAT-AB12",
  body: null,
  state: "open",
  draft: false,
  merged: false,
  mergeCommitSha: null,
  mergedAt: null,
  headRef: "fix/lat-ab12",
  headSha: "head-sha-1",
  headRepoId: REPO_ID,
  baseRef: "main",
  htmlUrl: "https://github.com/acme/app/pull/7",
  userLogin: "octocat",
  authorAssociation: "OWNER",
  changesBaseRef: null,
  now: new Date("2026-06-01T00:00:00.000Z"),
  ...overrides,
})

const pushInput = (overrides: Partial<ProcessGithubPushInput>): ProcessGithubPushInput => ({
  organizationId: ORG,
  integrationId: "",
  deliveryId: "push-delivery",
  repoId: REPO_ID,
  repoFullName: "acme/app",
  ref: "refs/heads/main",
  before: "before-sha",
  after: "after-sha",
  created: false,
  deleted: false,
  forced: false,
  commits: [],
  truncated: false,
  now: new Date("2026-06-01T01:00:00.000Z"),
  ...overrides,
})

let integrationId = ""

beforeEach(async () => {
  await pg.db.delete(githubSignalReferences)
  await pg.db.delete(githubDeliveries)
  await pg.db.delete(githubSyncConfigs)
  await pg.db.delete(githubIntegrationDetails)
  await pg.db.delete(integrations)
  await pg.db.delete(signals)
  await pg.db.delete(projects)

  await seedProject(PROJECT, "acme")
  await seedSignal("sig-ab12".padEnd(24, "a"), PROJECT, "LAT-AB12")
  const integration = await inOrg(
    claimGithubInstallationUseCase({
      organizationId: ORG,
      installedByUserId: USER,
      installationId: INSTALLATION_ID,
      accountLogin: "acme",
      accountType: "Organization",
      repositorySelection: "all",
    }),
  )
  integrationId = integration.id
  await seedRepoConfig(integrationId, PROJECT)
})

const references = () => pg.db.select().from(githubSignalReferences)
const signalRow = (slug: string) =>
  pg.db
    .select()
    .from(signals)
    .then((rows) => rows.find((r) => r.slug === slug))
const deliveries = () => pg.db.select().from(githubDeliveries)

describe("processGithubPullRequestUseCase", () => {
  it("references a matched signal on `opened` without applying the action", async () => {
    await inOrg(processGithubPullRequestUseCase(prInput({ integrationId, deliveryId: "d-open" })))

    const rows = await references()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.referenceType).toBe("pull_request")
    expect(rows[0]?.action).toBe("resolve")
    expect(rows[0]?.prState).toBe("open")
    expect(rows[0]?.actionAppliedAt).toBeNull()
    expect((await signalRow("LAT-AB12"))?.resolvedAt).toBeNull()
  })

  it("resolves the signal and stamps the ledger keys on merge", async () => {
    await inOrg(processGithubPullRequestUseCase(prInput({ integrationId, deliveryId: "d-open" })))
    await inOrg(
      processGithubPullRequestUseCase(
        prInput({
          integrationId,
          deliveryId: "d-merge",
          action: "closed",
          state: "closed",
          merged: true,
          mergeCommitSha: "merge-sha-1",
        }),
      ),
    )

    const rows = await references()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.prState).toBe("merged")
    expect(rows[0]?.actionAppliedAt).not.toBeNull()
    expect((await signalRow("LAT-AB12"))?.resolvedAt).not.toBeNull()

    const merged = (await deliveries()).find((d) => d.mergeCommitSha === "merge-sha-1")
    expect(merged?.prNumber).toBe(7)
    expect(merged?.headSha).toBe("head-sha-1")
  })

  it("is idempotent on redelivery of the merge", async () => {
    const merge = prInput({
      integrationId,
      deliveryId: "d-merge",
      action: "closed",
      state: "closed",
      merged: true,
      mergeCommitSha: "merge-sha-1",
    })
    await inOrg(processGithubPullRequestUseCase(merge))
    const first = (await signalRow("LAT-AB12"))?.resolvedAt
    await inOrg(processGithubPullRequestUseCase(merge))

    expect(await references()).toHaveLength(1)
    expect((await signalRow("LAT-AB12"))?.resolvedAt).toEqual(first)
  })

  it("recomputes on `edited`, dropping references that no longer match", async () => {
    await inOrg(processGithubPullRequestUseCase(prInput({ integrationId, deliveryId: "d-open" })))
    await inOrg(
      processGithubPullRequestUseCase(
        prInput({
          integrationId,
          deliveryId: "d-edit",
          action: "edited",
          title: "no slug here",
          headRef: "chore/cleanup",
        }),
      ),
    )
    expect(await references()).toHaveLength(0)
  })

  it("ignores untrusted fork PRs pre-merge", async () => {
    await inOrg(
      processGithubPullRequestUseCase(
        prInput({ integrationId, deliveryId: "d-fork", headRepoId: 9999, authorAssociation: "CONTRIBUTOR" }),
      ),
    )
    expect(await references()).toHaveLength(0)
    const delivery = (await deliveries()).find((d) => d.status === "skipped")
    expect(delivery?.skipReason).toBe("untrusted-fork")
  })

  it("skips events on unconfigured repos", async () => {
    await inOrg(processGithubPullRequestUseCase(prInput({ integrationId, deliveryId: "d-norepo", repoId: 111111 })))
    expect(await references()).toHaveLength(0)
    const delivery = (await deliveries()).find((d) => d.status === "skipped")
    expect(delivery?.skipReason).toBe("no-config")
  })

  it("unresolves via the revert convention", async () => {
    await inOrg(
      processGithubPullRequestUseCase(
        prInput({
          integrationId,
          deliveryId: "d-merge",
          action: "closed",
          state: "closed",
          merged: true,
          mergeCommitSha: "merge-sha-1",
        }),
      ),
    )
    expect((await signalRow("LAT-AB12"))?.resolvedAt).not.toBeNull()

    await inOrg(
      processGithubPullRequestUseCase(
        prInput({
          integrationId,
          deliveryId: "d-revert",
          prNumber: 8,
          title: "Revert the fix",
          body: "Reverts acme/app#7",
          action: "closed",
          state: "closed",
          merged: true,
          mergeCommitSha: "merge-sha-2",
          htmlUrl: "https://github.com/acme/app/pull/8",
        }),
      ),
    )
    expect((await signalRow("LAT-AB12"))?.resolvedAt).toBeNull()
  })
})

describe("processGithubPushUseCase", () => {
  it("creates a standalone commit reference and resolves immediately when unattributed", async () => {
    await inOrg(
      processGithubPushUseCase(
        pushInput({
          integrationId,
          deliveryId: "push-1",
          after: "commit-1",
          commits: [
            {
              id: "commit-1",
              message: "Fixes LAT-AB12",
              timestamp: "2026-06-01T01:00:00.000Z",
              authorUsername: "octocat",
              url: "https://github.com/acme/app/commit/commit-1",
            },
          ],
        }),
      ),
    )
    const rows = await references()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.referenceType).toBe("commit")
    expect(rows[0]?.commitSha).toBe("commit-1")
    expect(rows[0]?.actionAppliedAt).not.toBeNull()
    expect((await signalRow("LAT-AB12"))?.resolvedAt).not.toBeNull()
  })

  it("folds an attributed merge push into the PR without a duplicate commit reference (PR-first)", async () => {
    await inOrg(
      processGithubPullRequestUseCase(
        prInput({
          integrationId,
          deliveryId: "d-merge",
          action: "closed",
          state: "closed",
          merged: true,
          mergeCommitSha: "merge-sha-1",
        }),
      ),
    )
    await inOrg(
      processGithubPushUseCase(
        pushInput({
          integrationId,
          deliveryId: "push-1",
          after: "merge-sha-1",
          commits: [
            {
              id: "merge-sha-1",
              message: "Fixes LAT-AB12 (#7)",
              timestamp: "2026-06-01T01:00:00.000Z",
              authorUsername: "octocat",
              url: "https://github.com/acme/app/commit/merge-sha-1",
            },
          ],
        }),
      ),
    )
    const rows = await references()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.referenceType).toBe("pull_request")
  })

  it("absorbs a push-first commit reference into the PR reference on merge (push-first)", async () => {
    await inOrg(
      processGithubPushUseCase(
        pushInput({
          integrationId,
          deliveryId: "push-1",
          after: "merge-sha-1",
          commits: [
            {
              id: "merge-sha-1",
              message: "Fixes LAT-AB12",
              timestamp: "2026-06-01T01:00:00.000Z",
              authorUsername: "octocat",
              url: "https://github.com/acme/app/commit/merge-sha-1",
            },
          ],
        }),
      ),
    )
    expect(await references()).toHaveLength(1)

    await inOrg(
      processGithubPullRequestUseCase(
        prInput({
          integrationId,
          deliveryId: "d-merge",
          action: "closed",
          state: "closed",
          merged: true,
          mergeCommitSha: "merge-sha-1",
        }),
      ),
    )
    const rows = await references()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.referenceType).toBe("pull_request")
    expect((await signalRow("LAT-AB12"))?.resolvedAt).not.toBeNull()
  })

  it("applies the merged PR's action when it conflicts with the already-applied push commit (push-first)", async () => {
    // Push resolves the signal first — the commit reference's action is applied.
    await inOrg(
      processGithubPushUseCase(
        pushInput({
          integrationId,
          deliveryId: "push-1",
          after: "merge-sha-1",
          commits: [
            {
              id: "merge-sha-1",
              message: "Fixes LAT-AB12",
              timestamp: "2026-06-01T01:00:00.000Z",
              authorUsername: "octocat",
              url: "https://github.com/acme/app/commit/merge-sha-1",
            },
          ],
        }),
      ),
    )
    expect((await signalRow("LAT-AB12"))?.resolvedAt).not.toBeNull()

    // The merged PR resolves to unresolve; it is authoritative and must win over the commit.
    await inOrg(
      processGithubPullRequestUseCase(
        prInput({
          integrationId,
          deliveryId: "d-merge",
          title: "Reopen LAT-AB12",
          headRef: "reopen/lat-ab12",
          action: "closed",
          state: "closed",
          merged: true,
          mergeCommitSha: "merge-sha-1",
        }),
      ),
    )
    const rows = await references()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.referenceType).toBe("pull_request")
    expect(rows[0]?.action).toBe("unresolve")
    expect(rows[0]?.actionAppliedAt).not.toBeNull()
    expect((await signalRow("LAT-AB12"))?.resolvedAt).toBeNull()
  })
})

describe("deleteGithubProjectDataUseCase", () => {
  it("cascades away the project's config and references", async () => {
    await inOrg(processGithubPullRequestUseCase(prInput({ integrationId, deliveryId: "d-open" })))
    expect(await references()).toHaveLength(1)

    await inOrg(deleteGithubProjectDataUseCase({ projectId: PROJECT }))

    expect(await references()).toHaveLength(0)
    const configs = await pg.db.select().from(githubSyncConfigs)
    expect(configs.filter((c) => c.projectId === PROJECT)).toHaveLength(0)
  })
})
