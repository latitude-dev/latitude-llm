import type { OrganizationId, ProjectId } from "@domain/shared"
import {
  DEFAULT_GITHUB_MONITOR_SETTINGS,
  type GithubMatchingRules,
  type GithubSyncConfigRow,
  type GithubSyncSources,
} from "../entities/github-sync-config.ts"

/** A monitored repo+branch with its behavior fully resolved against the org default. */
export interface EffectiveGithubSyncConfig {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly integrationId: string
  readonly repoId: number
  readonly repoFullName: string
  readonly branch: string
  readonly enabled: boolean
  readonly monitorPullRequests: boolean
  readonly monitorCommits: boolean
  readonly sources: GithubSyncSources
  readonly rules: GithubMatchingRules
}

/**
 * Resolves a project repo row against the org-default row using the
 * `agent_dispatch_configs` cascade (5.4): each behavior field is inherited from
 * the default when null on the repo row, or replaces it wholesale when set (no
 * deep merge — a set `rules` replaces the whole object, keyword lists included).
 * The built-in defaults are the final fallback so a missing org-default row is
 * never fatal. Returns null when the row is not a complete repo binding.
 */
export const resolveEffectiveSyncConfig = (input: {
  readonly repoConfig: GithubSyncConfigRow
  readonly orgDefault: GithubSyncConfigRow | null
}): EffectiveGithubSyncConfig | null => {
  const { repoConfig, orgDefault } = input
  if (
    repoConfig.projectId === null ||
    repoConfig.repoId === null ||
    repoConfig.repoFullName === null ||
    repoConfig.branch === null
  ) {
    return null
  }

  return {
    id: repoConfig.id,
    organizationId: repoConfig.organizationId,
    projectId: repoConfig.projectId,
    integrationId: repoConfig.integrationId,
    repoId: repoConfig.repoId,
    repoFullName: repoConfig.repoFullName,
    branch: repoConfig.branch,
    enabled: repoConfig.enabled,
    monitorPullRequests:
      repoConfig.monitorPullRequests ??
      orgDefault?.monitorPullRequests ??
      DEFAULT_GITHUB_MONITOR_SETTINGS.monitorPullRequests,
    monitorCommits:
      repoConfig.monitorCommits ?? orgDefault?.monitorCommits ?? DEFAULT_GITHUB_MONITOR_SETTINGS.monitorCommits,
    sources: repoConfig.sources ?? orgDefault?.sources ?? DEFAULT_GITHUB_MONITOR_SETTINGS.sources,
    rules: repoConfig.rules ?? orgDefault?.rules ?? DEFAULT_GITHUB_MONITOR_SETTINGS.rules,
  }
}
