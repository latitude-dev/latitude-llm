import { generateId, type OrganizationId, type RepositoryError, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { GithubMonitorSettings, GithubSyncConfigRow } from "../entities/github-sync-config.ts"
import { GithubRepoNotInInstallationError } from "../errors.ts"
import { GithubSyncConfigRepository } from "../ports/repositories.ts"
import type { AllowedGithubRepo } from "./upsert-github-sync-config.ts"

export interface UpdateGithubOrgDefaultsInput {
  readonly organizationId: OrganizationId
  readonly integrationId: string
  readonly settings: GithubMonitorSettings
  /** The default repo/branch projects inherit (D16); null clears it. Validated against {@link allowedRepos}. */
  readonly defaultRepo: { readonly repoId: number; readonly branch: string } | null
  readonly allowedRepos: readonly AllowedGithubRepo[]
}

export type UpdateGithubOrgDefaultsError = RepositoryError | GithubRepoNotInInstallationError

/**
 * Updates the org-default sync config (the `project_id IS NULL` row): monitor
 * toggles, source toggles, matching rules, and the single default repo/branch
 * projects inherit (5.4/D16), all on one row / one save. The repo is validated
 * server-side against the installation's own repositories (D13); its full name
 * comes from that list, never client input. Upserts by id (create-if-missing).
 */
export const updateGithubOrgDefaultsUseCase = (
  input: UpdateGithubOrgDefaultsInput,
): Effect.Effect<GithubSyncConfigRow, UpdateGithubOrgDefaultsError, GithubSyncConfigRepository | SqlClient> =>
  Effect.gen(function* () {
    let repoId: number | null = null
    let repoFullName: string | null = null
    let branch: string | null = null
    if (input.defaultRepo !== null) {
      const allowed = input.allowedRepos.find((candidate) => candidate.id === input.defaultRepo?.repoId)
      if (!allowed)
        return yield* Effect.fail(new GithubRepoNotInInstallationError({ repoId: input.defaultRepo.repoId }))
      repoId = allowed.id
      repoFullName = allowed.fullName
      branch = input.defaultRepo.branch.trim() ? input.defaultRepo.branch.trim() : allowed.defaultBranch
    }

    const repo = yield* GithubSyncConfigRepository
    const existing = yield* repo.findDefaultByIntegration(input.integrationId)

    const now = new Date()
    const row: GithubSyncConfigRow = {
      id: existing?.id ?? generateId(),
      organizationId: input.organizationId,
      projectId: null,
      integrationId: input.integrationId,
      repoId,
      repoFullName,
      branch,
      enabled: true,
      monitorPullRequests: input.settings.monitorPullRequests,
      monitorCommits: input.settings.monitorCommits,
      sources: input.settings.sources,
      rules: input.settings.rules,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    return yield* repo.upsert(row)
  }).pipe(Effect.withSpan("github.updateOrgDefaults"))
