import {
  type ConcurrentSqlTransactionError,
  generateId,
  type OrganizationId,
  type RepositoryError,
  SqlClient,
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { GithubAccountType, GithubIntegration, GithubRepositorySelection } from "../entities/github-integration.ts"
import { DEFAULT_GITHUB_MONITOR_SETTINGS, type GithubSyncConfigRow } from "../entities/github-sync-config.ts"
import type { GithubIntegrationConflictError } from "../errors.ts"
import { GithubIntegrationRepository, GithubSyncConfigRepository } from "../ports/repositories.ts"

export interface ClaimGithubInstallationInput {
  readonly organizationId: OrganizationId
  readonly installedByUserId: UserId
  readonly installationId: number
  readonly accountLogin: string
  readonly accountType: GithubAccountType
  readonly repositorySelection: GithubRepositorySelection
}

export type ClaimGithubInstallationError =
  | RepositoryError
  | GithubIntegrationConflictError
  | ConcurrentSqlTransactionError

/**
 * Claims a GitHub App installation for the current organization: inserts the
 * `integrations` parent + `github_integration_details` child and seeds the
 * org-default `github_sync_configs` row with the built-in matching defaults —
 * all in one transaction. A prior active integration for this org is
 * soft-revoked first so the `(organization_id, kind)` partial unique holds;
 * cross-org conflicts surface from `save` as {@link GithubIntegrationConflictError}.
 */
export const claimGithubInstallationUseCase = (
  input: ClaimGithubInstallationInput,
): Effect.Effect<
  GithubIntegration,
  ClaimGithubInstallationError,
  SqlClient | GithubIntegrationRepository | GithubSyncConfigRepository
> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const integrationRepo = yield* GithubIntegrationRepository
        const syncConfigRepo = yield* GithubSyncConfigRepository

        const existing = yield* integrationRepo.findActiveByOrganizationId()
        if (existing) {
          yield* integrationRepo.softRevokeById(existing.id, new Date())
        }

        const now = new Date()
        const integration = yield* integrationRepo.save({
          id: generateId(),
          organizationId: input.organizationId,
          installationId: input.installationId,
          accountLogin: input.accountLogin,
          accountType: input.accountType,
          repositorySelection: input.repositorySelection,
          suspendedAt: null,
          installedByUserId: input.installedByUserId,
          installedAt: now,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
        })

        const orgDefault: GithubSyncConfigRow = {
          id: generateId(),
          organizationId: input.organizationId,
          projectId: null,
          integrationId: integration.id,
          repoId: null,
          repoFullName: null,
          branch: null,
          enabled: true,
          monitorPullRequests: DEFAULT_GITHUB_MONITOR_SETTINGS.monitorPullRequests,
          monitorCommits: DEFAULT_GITHUB_MONITOR_SETTINGS.monitorCommits,
          sources: DEFAULT_GITHUB_MONITOR_SETTINGS.sources,
          rules: DEFAULT_GITHUB_MONITOR_SETTINGS.rules,
          createdAt: now,
          updatedAt: now,
        }
        yield* syncConfigRepo.create(orgDefault)

        return integration
      }),
    )
  }).pipe(Effect.withSpan("github.claimInstallation"))
