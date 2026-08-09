/**
 * Server-fns backing the GitHub card on the **Integrations** settings page. The
 * read path goes through `GithubIntegrationRepository` so RLS on the
 * `integrations` parent + `github_integration_details` child enforces org
 * isolation. Disconnect soft-revokes locally (config + links are kept for
 * history, D8); uninstalling the app on GitHub is a separate user action that
 * triggers the same revoke via webhook.
 */
import {
  type AllowedGithubRepo,
  DEFAULT_GITHUB_MONITOR_SETTINGS,
  disconnectGithubIntegrationUseCase,
  type GithubDelivery,
  GithubDeliveryRepository,
  type GithubIntegration,
  GithubIntegrationNotFoundError,
  GithubIntegrationRepository,
  type GithubMatchAction,
  type GithubMonitorSettings,
  type GithubPrState,
  type GithubReferenceType,
  type GithubSignalReference,
  GithubSignalReferenceRepository,
  GithubSyncConfigRepository,
  type GithubSyncConfigRow,
  githubMonitorSettingsInputSchema,
  resetGithubProjectOverrideUseCase,
  updateGithubOrgDefaultsUseCase,
  upsertGithubSyncConfigUseCase,
} from "@domain/github"
import { type OrganizationId, ProjectId, type RepositoryError, type SqlClient } from "@domain/shared"
import {
  GithubDeliveryRepositoryLive,
  GithubIntegrationRepositoryLive,
  GithubSignalReferenceRepositoryLive,
  GithubSyncConfigRepositoryLive,
  MembershipRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { getInstallationToken, listInstallationRepositories, loadGithubConfig } from "@platform/github"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getRedisClient } from "../../server/clients.ts"
import { requireOrganizationOwner } from "../../server/require-owner.ts"

const githubConfigLayer = Layer.mergeAll(GithubIntegrationRepositoryLive, GithubSyncConfigRepositoryLive)

const REPO_CACHE_TTL_SECONDS = 5 * 60

interface GithubIntegrationRecord {
  readonly id: string
  readonly installationId: number
  readonly accountLogin: string
  readonly accountType: string
  readonly accountAvatarUrl: string | null
  readonly repositorySelection: string
  readonly suspendedAt: string | null
  readonly installedAt: string
}

const toRecord = (integration: GithubIntegration, baseUrl: string | null): GithubIntegrationRecord => ({
  id: integration.id,
  installationId: integration.installationId,
  accountLogin: integration.accountLogin,
  accountType: integration.accountType,
  accountAvatarUrl: baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(integration.accountLogin)}.png?size=80`
    : null,
  repositorySelection: integration.repositorySelection,
  suspendedAt: integration.suspendedAt?.toISOString() ?? null,
  installedAt: integration.installedAt.toISOString(),
})

export const GITHUB_INTEGRATION_QUERY_KEY = ["github-integration"] as const
export const GITHUB_REPOS_QUERY_KEY = ["github-integration", "repos"] as const
export const GITHUB_ORG_DEFAULTS_QUERY_KEY = ["github-integration", "org-defaults"] as const

export const isGithubIntegrationConfigured = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => {
  await requireSession()
  const { loadGithubConfig } = await import("@platform/github")
  const config = await Effect.runPromise(loadGithubConfig)
  return config !== undefined
})

export const getActiveGithubIntegration = createServerFn({ method: "GET" }).handler(
  async (): Promise<GithubIntegrationRecord | null> => {
    const { organizationId } = await requireSession()
    const config = await Effect.runPromise(loadGithubConfig)
    const integration = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* GithubIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }).pipe(withPostgres(GithubIntegrationRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )
    return integration ? toRecord(integration, config?.baseUrl ?? null) : null
  },
)

export const disconnectGithubIntegration = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ readonly revoked: boolean }> => {
    const { organizationId, userId } = await requireSession()

    await Effect.runPromise(
      requireOrganizationOwner({ organizationId, userId, what: "the organization GitHub integration" }).pipe(
        withPostgres(MembershipRepositoryLive, getPostgresClient(), organizationId),
        withTracing,
      ),
    )

    return Effect.runPromise(
      disconnectGithubIntegrationEffect.pipe(
        withPostgres(GithubIntegrationRepositoryLive, getPostgresClient(), organizationId),
        withTracing,
      ),
    )
  },
)

const disconnectGithubIntegrationEffect: Effect.Effect<
  { readonly revoked: boolean },
  RepositoryError,
  GithubIntegrationRepository | SqlClient
> = Effect.gen(function* () {
  const repo = yield* GithubIntegrationRepository
  const active = yield* repo.findActiveByOrganizationId()
  if (active === null) return { revoked: false } as const
  yield* disconnectGithubIntegrationUseCase({ id: active.id })
  return { revoked: true } as const
})

export interface GithubProjectConfigRecord {
  /** Whether this project has its own config row, which is what binds a repo. */
  readonly hasOverride: boolean
  /** Whether this project replaces the org default's monitoring behavior. */
  readonly hasBehaviorOverride: boolean
  /** How many projects in the org replace the behavior default — the "N override it" count. */
  readonly overrideCount: number
  /** Effective repo/branch: the override's when present, else the org default's; null when neither is set. */
  readonly repoId: number | null
  readonly repoFullName: string | null
  readonly branch: string | null
  /** Fully-resolved behavior (override → org default → built-ins), seeding the override form. */
  readonly settings: GithubMonitorSettings
}

export interface GithubDefaultRepoRecord {
  readonly repoId: number
  readonly repoFullName: string
  readonly branch: string
}

interface GithubOrgDefaultsRecord {
  readonly integrationId: string
  readonly settings: GithubMonitorSettings
  /** How many projects replace this behavior default — the "N override it" count. */
  readonly overrideCount: number
  /** Org-default repo/branch inherited by projects with no binding of their own (D16); null when unset. */
  readonly defaultRepo: GithubDefaultRepoRecord | null
}

const settingsFromRow = (row: GithubSyncConfigRow): GithubMonitorSettings => ({
  monitorPullRequests: row.monitorPullRequests ?? DEFAULT_GITHUB_MONITOR_SETTINGS.monitorPullRequests,
  monitorCommits: row.monitorCommits ?? DEFAULT_GITHUB_MONITOR_SETTINGS.monitorCommits,
  sources: row.sources ?? DEFAULT_GITHUB_MONITOR_SETTINGS.sources,
  rules: row.rules ?? DEFAULT_GITHUB_MONITOR_SETTINGS.rules,
})

const toDefaultRepo = (row: GithubSyncConfigRow): GithubDefaultRepoRecord | null =>
  row.repoId !== null && row.repoFullName !== null && row.branch !== null
    ? { repoId: row.repoId, repoFullName: row.repoFullName, branch: row.branch }
    : null

const effectiveSettings = (
  override: GithubSyncConfigRow | null,
  orgDefault: GithubSyncConfigRow | null,
): GithubMonitorSettings => ({
  monitorPullRequests:
    override?.monitorPullRequests ??
    orgDefault?.monitorPullRequests ??
    DEFAULT_GITHUB_MONITOR_SETTINGS.monitorPullRequests,
  monitorCommits:
    override?.monitorCommits ?? orgDefault?.monitorCommits ?? DEFAULT_GITHUB_MONITOR_SETTINGS.monitorCommits,
  sources: override?.sources ?? orgDefault?.sources ?? DEFAULT_GITHUB_MONITOR_SETTINGS.sources,
  rules: override?.rules ?? orgDefault?.rules ?? DEFAULT_GITHUB_MONITOR_SETTINGS.rules,
})

/**
 * Whether a row replaces the org default's behavior. Distinct from having a row at
 * all: a project can bind its own repo while still inheriting every behavior field.
 */
const hasBehaviorOverride = (row: GithubSyncConfigRow | null): boolean =>
  row !== null &&
  (row.monitorPullRequests !== null || row.monitorCommits !== null || row.sources !== null || row.rules !== null)

const toProjectConfigRecord = (
  override: GithubSyncConfigRow | null,
  orgDefault: GithubSyncConfigRow | null,
  overrideCount: number,
): GithubProjectConfigRecord => ({
  hasOverride: override !== null,
  hasBehaviorOverride: hasBehaviorOverride(override),
  overrideCount,
  repoId: override?.repoId ?? orgDefault?.repoId ?? null,
  repoFullName: override?.repoFullName ?? orgDefault?.repoFullName ?? null,
  branch: override?.branch ?? orgDefault?.branch ?? null,
  settings: effectiveSettings(override, orgDefault),
})

/**
 * Repositories the org's installation can see, cached in Redis (`org:*:github:repos:*`,
 * 5m TTL). Feeds the settings repo picker and is the D13 allow-list every repo
 * binding is validated against server-side.
 */
const loadInstallationRepos = async (organizationId: OrganizationId): Promise<AllowedGithubRepo[]> => {
  const config = await Effect.runPromise(loadGithubConfig)
  if (!config) throw new GithubIntegrationNotFoundError({ reason: "not_connected" })

  const integration = await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* GithubIntegrationRepository
      return yield* repo.findActiveByOrganizationId()
    }).pipe(withPostgres(GithubIntegrationRepositoryLive, getPostgresClient(), organizationId), withTracing),
  )
  if (!integration) throw new GithubIntegrationNotFoundError({ reason: "not_connected" })

  const redis = getRedisClient()
  const cacheKey = `org:${organizationId}:github:repos:${integration.installationId}`
  const cached = await redis.get(cacheKey).catch(() => null)
  if (cached) {
    try {
      return JSON.parse(cached) as AllowedGithubRepo[]
    } catch {
      // Corrupt cache entry — fall through and re-fetch.
    }
  }

  const repos = await Effect.runPromise(
    Effect.gen(function* () {
      const token = yield* getInstallationToken({
        config,
        installationId: integration.installationId,
        organizationId,
        redis,
      })
      const list = yield* listInstallationRepositories({ config, installationToken: token })
      return list.map((repo) => ({ id: repo.id, fullName: repo.fullName, defaultBranch: repo.defaultBranch }))
    }).pipe(withTracing),
  )
  await redis.set(cacheKey, JSON.stringify(repos), "EX", REPO_CACHE_TTL_SECONDS).catch(() => undefined)
  return repos
}

export const getGithubOrgDefaults = createServerFn({ method: "GET" }).handler(
  async (): Promise<GithubOrgDefaultsRecord | null> => {
    const { organizationId } = await requireSession()
    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* GithubIntegrationRepository
        const syncRepo = yield* GithubSyncConfigRepository
        const integration = yield* integrationRepo.findActiveByOrganizationId()
        if (!integration) return null
        const orgDefault = yield* syncRepo.findDefaultByIntegration(integration.id)
        if (!orgDefault) return null
        const projectConfigs = yield* syncRepo.listProjectConfigs(integration.id)
        return {
          integrationId: integration.id,
          settings: settingsFromRow(orgDefault),
          defaultRepo: toDefaultRepo(orgDefault),
          overrideCount: projectConfigs.filter(hasBehaviorOverride).length,
        }
      }).pipe(withPostgres(githubConfigLayer, getPostgresClient(), organizationId), withTracing),
    )
  },
)

const updateOrgDefaultsSchema = githubMonitorSettingsInputSchema.extend({
  defaultRepoId: z.number().int().positive().nullable(),
  defaultBranch: z.string().nullable(),
})

export const updateGithubOrgDefaults = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateOrgDefaultsSchema.parse(data))
  .handler(async ({ data }): Promise<GithubOrgDefaultsRecord> => {
    const { organizationId, userId } = await requireSession()
    const { defaultRepoId, defaultBranch, ...settings } = data

    // Ahead of loadInstallationRepos, so a rejected caller never reaches the GitHub API.
    await Effect.runPromise(
      requireOrganizationOwner({ organizationId, userId, what: "the organization GitHub defaults" }).pipe(
        withPostgres(MembershipRepositoryLive, getPostgresClient(), organizationId),
        withTracing,
      ),
    )

    const allowedRepos = defaultRepoId === null ? [] : await loadInstallationRepos(organizationId)
    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* GithubIntegrationRepository
        const syncRepo = yield* GithubSyncConfigRepository
        const integration = yield* integrationRepo.findActiveByOrganizationId()
        if (!integration) return yield* Effect.fail(new GithubIntegrationNotFoundError({ reason: "not_connected" }))
        const row = yield* updateGithubOrgDefaultsUseCase({
          organizationId,
          integrationId: integration.id,
          settings,
          defaultRepo: defaultRepoId === null ? null : { repoId: defaultRepoId, branch: defaultBranch ?? "" },
          allowedRepos,
        })
        const projectConfigs = yield* syncRepo.listProjectConfigs(integration.id)
        return {
          integrationId: integration.id,
          settings: settingsFromRow(row),
          defaultRepo: toDefaultRepo(row),
          overrideCount: projectConfigs.filter(hasBehaviorOverride).length,
        }
      }).pipe(withPostgres(githubConfigLayer, getPostgresClient(), organizationId), withTracing),
    )
  })

export const getGithubProjectConfig = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ projectId: z.string() }).parse(data))
  .handler(async ({ data }): Promise<GithubProjectConfigRecord | null> => {
    const { organizationId } = await requireSession()
    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* GithubIntegrationRepository
        const syncRepo = yield* GithubSyncConfigRepository
        const integration = yield* integrationRepo.findActiveByOrganizationId()
        if (!integration) return null
        const orgDefault = yield* syncRepo.findDefaultByIntegration(integration.id)
        const override = yield* syncRepo.findByProject(integration.id, data.projectId)
        const projectConfigs = yield* syncRepo.listProjectConfigs(integration.id)
        return toProjectConfigRecord(override, orgDefault, projectConfigs.filter(hasBehaviorOverride).length)
      }).pipe(withPostgres(githubConfigLayer, getPostgresClient(), organizationId), withTracing),
    )
  })

const upsertProjectConfigSchema = z.object({
  projectId: z.string(),
  repoId: z.number().int().positive(),
  branch: z.string().min(1),
  enabled: z.boolean().optional(),
  overrides: githubMonitorSettingsInputSchema.nullable().optional(),
})

const overrideInputs = (
  overrides: GithubMonitorSettings | null | undefined,
):
  | Pick<GithubSyncConfigRow, "monitorPullRequests" | "monitorCommits" | "sources" | "rules">
  | Record<string, never> => {
  if (overrides === undefined) return {}
  if (overrides === null) return { monitorPullRequests: null, monitorCommits: null, sources: null, rules: null }
  return {
    monitorPullRequests: overrides.monitorPullRequests,
    monitorCommits: overrides.monitorCommits,
    sources: overrides.sources,
    rules: overrides.rules,
  }
}

export const upsertGithubProjectConfig = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertProjectConfigSchema.parse(data))
  .handler(async ({ data }): Promise<GithubProjectConfigRecord> => {
    const { organizationId } = await requireSession()
    const allowedRepos = await loadInstallationRepos(organizationId)
    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* GithubIntegrationRepository
        const syncRepo = yield* GithubSyncConfigRepository
        const integration = yield* integrationRepo.findActiveByOrganizationId()
        if (!integration) return yield* Effect.fail(new GithubIntegrationNotFoundError({ reason: "not_connected" }))
        const override = yield* upsertGithubSyncConfigUseCase({
          organizationId,
          projectId: ProjectId(data.projectId),
          integrationId: integration.id,
          repoId: data.repoId,
          branch: data.branch,
          ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
          ...overrideInputs(data.overrides),
          allowedRepos,
        })
        const orgDefault = yield* syncRepo.findDefaultByIntegration(integration.id)
        const projectConfigs = yield* syncRepo.listProjectConfigs(integration.id)
        return toProjectConfigRecord(override, orgDefault, projectConfigs.filter(hasBehaviorOverride).length)
      }).pipe(withPostgres(githubConfigLayer, getPostgresClient(), organizationId), withTracing),
    )
  })

export const resetGithubProjectOverride = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ projectId: z.string() }).parse(data))
  .handler(async ({ data }): Promise<GithubProjectConfigRecord | null> => {
    const { organizationId } = await requireSession()
    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* GithubIntegrationRepository
        const syncRepo = yield* GithubSyncConfigRepository
        yield* resetGithubProjectOverrideUseCase({ projectId: ProjectId(data.projectId) })
        const integration = yield* integrationRepo.findActiveByOrganizationId()
        if (!integration) return null
        const orgDefault = yield* syncRepo.findDefaultByIntegration(integration.id)
        const projectConfigs = yield* syncRepo.listProjectConfigs(integration.id)
        return toProjectConfigRecord(null, orgDefault, projectConfigs.filter(hasBehaviorOverride).length)
      }).pipe(withPostgres(githubConfigLayer, getPostgresClient(), organizationId), withTracing),
    )
  })

export const listGithubInstallationRepositories = createServerFn({ method: "GET" }).handler(
  async (): Promise<AllowedGithubRepo[]> => {
    const { organizationId } = await requireSession()
    return loadInstallationRepos(organizationId)
  },
)

export interface GithubSignalReferenceRecord {
  readonly id: string
  readonly referenceType: GithubReferenceType
  readonly repoFullName: string
  readonly prNumber: number | null
  readonly prState: GithubPrState | null
  readonly commitSha: string | null
  readonly title: string
  readonly url: string
  readonly authorLogin: string | null
  readonly action: GithubMatchAction
  readonly actionAppliedAt: string | null
  readonly mergedAt: string | null
  readonly updatedAt: string
  readonly createdAt: string
}

const toReferenceRecord = (reference: GithubSignalReference): GithubSignalReferenceRecord => ({
  id: reference.id,
  referenceType: reference.referenceType,
  repoFullName: reference.repoFullName,
  prNumber: reference.prNumber,
  prState: reference.prState,
  commitSha: reference.commitSha,
  title: reference.title,
  url: reference.url,
  authorLogin: reference.authorLogin,
  action: reference.action,
  actionAppliedAt: reference.actionAppliedAt?.toISOString() ?? null,
  mergedAt: reference.mergedAt?.toISOString() ?? null,
  updatedAt: reference.updatedAt.toISOString(),
  createdAt: reference.createdAt.toISOString(),
})

export const signalGithubReferencesQueryKey = (projectId: string, signalId: string) =>
  ["signal-github-references", projectId, signalId] as const

export const listSignalGithubReferences = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), signalId: z.string() }))
  .handler(async ({ data }): Promise<readonly GithubSignalReferenceRecord[]> => {
    const { organizationId } = await requireSession()
    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* GithubSignalReferenceRepository
        const references = yield* repo.listBySignal(data.signalId)
        return references.filter((reference) => reference.projectId === data.projectId).map(toReferenceRecord)
      }).pipe(withPostgres(GithubSignalReferenceRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )
  })

export interface GithubDeliveryRecord {
  readonly id: string
  readonly deliveryId: string
  readonly event: string
  readonly action: string | null
  readonly repoId: number | null
  readonly status: string | null
  readonly skipReason: string | null
  readonly errorCategory: string | null
  readonly errorDetail: string | null
  readonly truncated: boolean
  readonly prNumber: number | null
  readonly receivedAt: string
  readonly processedAt: string | null
}

const toDeliveryRecord = (delivery: GithubDelivery): GithubDeliveryRecord => ({
  id: delivery.id,
  deliveryId: delivery.deliveryId,
  event: delivery.event,
  action: delivery.action,
  repoId: delivery.repoId,
  status: delivery.status,
  skipReason: delivery.skipReason,
  errorCategory: delivery.errorCategory,
  errorDetail: delivery.errorDetail,
  truncated: delivery.truncated,
  prNumber: delivery.prNumber,
  receivedAt: delivery.receivedAt.toISOString(),
  processedAt: delivery.processedAt?.toISOString() ?? null,
})

export interface GithubDeliveryCursor {
  readonly receivedAt: string
  readonly id: string
}

interface GithubDeliveryPage {
  readonly deliveries: readonly GithubDeliveryRecord[]
  readonly nextCursor: GithubDeliveryCursor | null
}

const GITHUB_DELIVERIES_PAGE_SIZE = 25

const listGithubDeliveriesSchema = z.object({
  before: z.object({ receivedAt: z.string(), id: z.string() }).optional(),
})

export const listGithubDeliveries = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => listGithubDeliveriesSchema.parse(data))
  .handler(async ({ data }): Promise<GithubDeliveryPage> => {
    const { organizationId } = await requireSession()
    const deliveries = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* GithubDeliveryRepository
        return yield* repo.listRecentByOrganization({
          limit: GITHUB_DELIVERIES_PAGE_SIZE + 1,
          ...(data.before ? { before: { receivedAt: new Date(data.before.receivedAt), id: data.before.id } } : {}),
        })
      }).pipe(withPostgres(GithubDeliveryRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )
    const hasMore = deliveries.length > GITHUB_DELIVERIES_PAGE_SIZE
    const page = hasMore ? deliveries.slice(0, GITHUB_DELIVERIES_PAGE_SIZE) : deliveries
    const last = page[page.length - 1]
    return {
      deliveries: page.map(toDeliveryRecord),
      nextCursor: hasMore && last ? { receivedAt: last.receivedAt.toISOString(), id: last.id } : null,
    }
  })
