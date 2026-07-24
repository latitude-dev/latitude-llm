import { generateId, type OrganizationId, type ProjectId, type RepositoryError, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { GithubMatchingRules, GithubSyncConfigRow, GithubSyncSources } from "../entities/github-sync-config.ts"
import { GithubRepoNotInInstallationError } from "../errors.ts"
import { GithubSyncConfigRepository } from "../ports/repositories.ts"

/** A repository the installation can see — the D13 allow-list the binding is validated against. */
export interface AllowedGithubRepo {
  readonly id: number
  readonly fullName: string
  readonly defaultBranch: string
}

/**
 * Creates or edits a project repo binding. Override fields follow the cascade
 * convention: `undefined` keeps the stored value, `null` inherits the org
 * default, a value replaces it wholesale.
 */
export interface UpsertGithubSyncConfigInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly integrationId: string
  readonly repoId: number
  readonly branch: string
  readonly enabled?: boolean
  readonly monitorPullRequests?: boolean | null
  readonly monitorCommits?: boolean | null
  readonly sources?: GithubSyncSources | null
  readonly rules?: GithubMatchingRules | null
  /** Repositories the org's installation can see; the binding must name one (D13). */
  readonly allowedRepos: readonly AllowedGithubRepo[]
}

export type UpsertGithubSyncConfigError = RepositoryError | GithubRepoNotInInstallationError

/**
 * Sets a project's single repo override (its repo+branch and optional behavior
 * overrides), creating it or editing the existing one — at most one per project
 * (the org default applies otherwise). Validates server-side that `repoId`
 * belongs to the org's own installation (D13); `repoFullName` is taken from the
 * installation's repo list, never client input.
 */
export const upsertGithubSyncConfigUseCase = (
  input: UpsertGithubSyncConfigInput,
): Effect.Effect<GithubSyncConfigRow, UpsertGithubSyncConfigError, GithubSyncConfigRepository | SqlClient> =>
  Effect.gen(function* () {
    const allowed = input.allowedRepos.find((repo) => repo.id === input.repoId)
    if (!allowed) return yield* Effect.fail(new GithubRepoNotInInstallationError({ repoId: input.repoId }))

    const repo = yield* GithubSyncConfigRepository
    const existing = yield* repo.findByProject(input.integrationId, input.projectId)

    const now = new Date()
    const row: GithubSyncConfigRow = {
      id: existing?.id ?? generateId(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      integrationId: input.integrationId,
      repoId: input.repoId,
      repoFullName: allowed.fullName,
      branch: input.branch,
      enabled: input.enabled ?? existing?.enabled ?? true,
      monitorPullRequests:
        input.monitorPullRequests !== undefined ? input.monitorPullRequests : (existing?.monitorPullRequests ?? null),
      monitorCommits: input.monitorCommits !== undefined ? input.monitorCommits : (existing?.monitorCommits ?? null),
      sources: input.sources !== undefined ? input.sources : (existing?.sources ?? null),
      rules: input.rules !== undefined ? input.rules : (existing?.rules ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    return yield* repo.upsert(row)
  }).pipe(Effect.withSpan("github.upsertSyncConfig"))
