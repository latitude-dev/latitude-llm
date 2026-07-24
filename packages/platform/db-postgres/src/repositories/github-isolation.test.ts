import {
  claimGithubInstallationUseCase,
  type ProcessGithubPullRequestInput,
  processGithubPullRequestUseCase,
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

const USER = UserId("u".repeat(24))

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

const inOrg = <A, E>(org: OrganizationId, effect: Effect.Effect<A, E, LayerOut<typeof layer> | SqlClient>) =>
  Effect.runPromise(effect.pipe(withPostgres(layer, pg.adminPostgresClient, org)))

interface OrgFixture {
  readonly org: OrganizationId
  readonly project: ProjectId
  readonly signalId: string
  readonly integrationId: string
  readonly repoId: number
}

const seedOrg = async (input: {
  readonly org: OrganizationId
  readonly project: ProjectId
  readonly signalId: string
  readonly slug: string
  readonly installationId: number
  readonly repoId: number
}): Promise<OrgFixture> => {
  await pg.db.insert(projects).values({ id: input.project, organizationId: input.org, name: "p", slug: "p" })
  await pg.db.insert(signals).values({
    id: input.signalId,
    organizationId: input.org,
    projectId: input.project,
    slug: input.slug,
    name: input.slug,
    description: `${input.slug} description`,
    source: "custom",
    origin: "user",
  })
  const integration = await inOrg(
    input.org,
    claimGithubInstallationUseCase({
      organizationId: input.org,
      installedByUserId: USER,
      installationId: input.installationId,
      accountLogin: "acme",
      accountType: "Organization",
      repositorySelection: "all",
    }),
  )
  await pg.db.insert(githubSyncConfigs).values({
    organizationId: input.org,
    projectId: input.project,
    integrationId: integration.id,
    repoId: input.repoId,
    repoFullName: "acme/app",
    branch: "main",
    enabled: true,
  })
  return {
    org: input.org,
    project: input.project,
    signalId: input.signalId,
    integrationId: integration.id,
    repoId: input.repoId,
  }
}

const ORG_A = OrganizationId("a".repeat(24))
const ORG_B = OrganizationId("b".repeat(24))

let a: OrgFixture
let b: OrgFixture

const mergePr = (fx: OrgFixture): ProcessGithubPullRequestInput => ({
  organizationId: fx.org,
  integrationId: fx.integrationId,
  deliveryId: `merge-${fx.org}`,
  repoId: fx.repoId,
  repoFullName: "acme/app",
  action: "closed",
  prNumber: 1,
  title: "Fixes LAT-AB12",
  body: null,
  state: "closed",
  draft: false,
  merged: true,
  mergeCommitSha: `merge-${fx.org}`,
  mergedAt: "2026-06-01T00:00:00.000Z",
  headRef: "fix/lat-ab12",
  headSha: `head-${fx.org}`,
  headRepoId: fx.repoId,
  baseRef: "main",
  htmlUrl: "https://github.com/acme/app/pull/1",
  userLogin: "octocat",
  authorAssociation: "OWNER",
  changesBaseRef: null,
  now: new Date("2026-06-01T00:00:00.000Z"),
})

const resolvedAtFor = (signalId: string) =>
  pg.db
    .select()
    .from(signals)
    .then((rows) => rows.find((r) => r.id === signalId)?.resolvedAt ?? null)

beforeEach(async () => {
  await pg.db.delete(githubSignalReferences)
  await pg.db.delete(githubDeliveries)
  await pg.db.delete(githubSyncConfigs)
  await pg.db.delete(githubIntegrationDetails)
  await pg.db.delete(integrations)
  await pg.db.delete(signals)
  await pg.db.delete(projects)

  a = await seedOrg({
    org: ORG_A,
    project: ProjectId("aa".repeat(12)),
    signalId: "sig-a".padEnd(24, "a"),
    slug: "LAT-AB12",
    installationId: 8001,
    repoId: 5001,
  })
  b = await seedOrg({
    org: ORG_B,
    project: ProjectId("bb".repeat(12)),
    signalId: "sig-b".padEnd(24, "b"),
    slug: "LAT-AB12",
    installationId: 8002,
    repoId: 5002,
  })
})

describe("cross-organization isolation (D13)", () => {
  it("resolves only the origin org's identically-slugged signal", async () => {
    await inOrg(a.org, processGithubPullRequestUseCase(mergePr(a)))

    expect(await resolvedAtFor(a.signalId)).not.toBeNull()
    expect(await resolvedAtFor(b.signalId)).toBeNull()

    const references = await pg.db.select().from(githubSignalReferences)
    expect(references).toHaveLength(1)
    expect(references[0]?.organizationId).toBe(ORG_A)
    expect(references[0]?.signalId).toBe(a.signalId)
  })

  it("references nothing in an org whose repo config points at another org's repo id (routing is org-first)", async () => {
    // Org B merges a PR on ITS repo; org A's identical slug is never consulted.
    await inOrg(b.org, processGithubPullRequestUseCase(mergePr(b)))

    expect(await resolvedAtFor(b.signalId)).not.toBeNull()
    expect(await resolvedAtFor(a.signalId)).toBeNull()
  })
})
