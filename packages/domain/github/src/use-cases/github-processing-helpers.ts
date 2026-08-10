import { ProjectRepository } from "@domain/projects"
import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { applySignalLifecycleCommandUseCase, SignalRepository, type SignalRepositoryShape } from "@domain/signals"
import { Effect } from "effect"
import type { GithubSignalReference } from "../entities/github-signal-reference.ts"
import {
  DEFAULT_GITHUB_MONITOR_SETTINGS,
  type GithubSyncConfigRow,
  type GithubSyncSources,
} from "../entities/github-sync-config.ts"
import { type EffectiveGithubSyncConfig, resolveEffectiveSyncConfig } from "../helpers/resolve-effective-sync-config.ts"
import { matchTexts } from "../matching/match-texts.ts"
import type { GithubMatchAction, GithubTextSource, MatchTextInput } from "../matching/types.ts"
import { GithubSignalReferenceRepository, GithubSyncConfigRepository } from "../ports/repositories.ts"

/** PR authors whose text is trusted pre-merge on public repos (5.8/D13); everyone else waits for merge. */
const GITHUB_TRUSTED_ASSOCIATIONS: ReadonlySet<string> = new Set(["OWNER", "MEMBER", "COLLABORATOR"])

export const isTrustedPrAuthor = (input: {
  readonly headRepoId: number | null
  readonly repoId: number
  readonly authorAssociation: string
}): boolean => input.headRepoId === input.repoId || GITHUB_TRUSTED_ASSOCIATIONS.has(input.authorAssociation)

const inheritingConfig = (projectId: ProjectId, orgDefault: GithubSyncConfigRow): EffectiveGithubSyncConfig | null => {
  if (orgDefault.repoId === null || orgDefault.repoFullName === null || orgDefault.branch === null) return null
  return {
    id: orgDefault.id,
    organizationId: orgDefault.organizationId,
    projectId,
    integrationId: orgDefault.integrationId,
    repoId: orgDefault.repoId,
    repoFullName: orgDefault.repoFullName,
    branch: orgDefault.branch,
    enabled: true,
    monitorPullRequests: orgDefault.monitorPullRequests ?? DEFAULT_GITHUB_MONITOR_SETTINGS.monitorPullRequests,
    monitorCommits: orgDefault.monitorCommits ?? DEFAULT_GITHUB_MONITOR_SETTINGS.monitorCommits,
    sources: orgDefault.sources ?? DEFAULT_GITHUB_MONITOR_SETTINGS.sources,
    rules: orgDefault.rules ?? DEFAULT_GITHUB_MONITOR_SETTINGS.rules,
  }
}

/**
 * The effective configs (5.4) that watch a repo+branch: every project with an
 * enabled override bound to the repo, plus — when the repo+branch is the org
 * default — every project that has no override of its own and therefore inherits
 * it (D16). One entry per watching project; slug resolution then routes each
 * org-unique slug to its single owner (D15).
 */
export const resolveWatchingConfigs = (input: {
  readonly integrationId: string
  readonly repoId: number
  readonly branch: string
}): Effect.Effect<
  readonly EffectiveGithubSyncConfig[],
  RepositoryError,
  GithubSyncConfigRepository | ProjectRepository | SqlClient
> =>
  Effect.gen(function* () {
    const syncConfigRepo = yield* GithubSyncConfigRepository
    const orgDefault = yield* syncConfigRepo.findDefaultByIntegration(input.integrationId)
    const configs: EffectiveGithubSyncConfig[] = []

    for (const row of yield* syncConfigRepo.listByOrganizationRepo(input.integrationId, input.repoId)) {
      const eff = resolveEffectiveSyncConfig({ repoConfig: row, orgDefault })
      if (eff?.enabled && eff.branch === input.branch) configs.push(eff)
    }

    const repoIsOrgDefault =
      orgDefault !== null && orgDefault.repoId === input.repoId && orgDefault.branch === input.branch
    if (repoIsOrgDefault && orgDefault !== null) {
      const overridden = new Set(
        (yield* syncConfigRepo.listProjectConfigs(input.integrationId)).map((row) => row.projectId),
      )
      const projects = yield* (yield* ProjectRepository).list()
      for (const project of projects) {
        if (overridden.has(project.id)) continue
        const eff = inheritingConfig(project.id, orgDefault)
        if (eff) configs.push(eff)
      }
    }
    return configs
  })

export interface ResolvedMatch {
  readonly projectId: ProjectId
  readonly signalId: string
  readonly action: GithubMatchAction
  readonly sources: readonly GithubTextSource[]
}

const resolveSlugInProject = (
  signalRepo: SignalRepositoryShape,
  projectId: ProjectId,
  slug: string,
): Effect.Effect<string | null, RepositoryError, SqlClient> =>
  signalRepo.findBySlug({ projectId, slug }).pipe(
    Effect.map((signal): string | null => signal.id),
    Effect.catchTag("NotFoundError", () => Effect.succeed<string | null>(null)),
  )

/**
 * Runs the matcher for each watching config with its own rules/sources, then
 * resolves each candidate slug in that config's project (per-project
 * `findBySlug`; org-unique slugs route each slug to exactly one project). Unknown
 * or soft-deleted slugs are dropped.
 */
export const resolveMatchesForConfigs = (input: {
  readonly configs: readonly EffectiveGithubSyncConfig[]
  readonly buildInputs: (config: EffectiveGithubSyncConfig) => readonly MatchTextInput[]
}): Effect.Effect<readonly ResolvedMatch[], RepositoryError, SignalRepository | SqlClient> =>
  Effect.gen(function* () {
    const signalRepo = yield* SignalRepository
    const matches: ResolvedMatch[] = []
    for (const config of input.configs) {
      const inputs = input.buildInputs(config)
      if (inputs.length === 0) continue
      for (const result of matchTexts([...inputs], config.rules)) {
        const signalId = yield* resolveSlugInProject(signalRepo, config.projectId, result.slug)
        if (signalId !== null)
          matches.push({ projectId: config.projectId, signalId, action: result.action, sources: result.sources })
      }
    }
    return matches
  })

/**
 * Per-commit slug resolution for unattributed pushes (5.8 step 3): each commit
 * keeps its own identity so a standalone commit reference is upserted per matched
 * signal per commit (`commitMessage` source only).
 */
export const resolveCommitMatches = (input: {
  readonly configs: readonly EffectiveGithubSyncConfig[]
  readonly commits: readonly { readonly id: string; readonly message: string }[]
}): Effect.Effect<
  readonly { readonly commitId: string; readonly match: ResolvedMatch }[],
  RepositoryError,
  SignalRepository | SqlClient
> =>
  Effect.gen(function* () {
    const signalRepo = yield* SignalRepository
    const out: { commitId: string; match: ResolvedMatch }[] = []
    for (const commit of input.commits) {
      for (const config of input.configs) {
        if (!config.sources.commitMessage) continue
        for (const result of matchTexts([{ source: "commitMessage", text: commit.message }], config.rules)) {
          const signalId = yield* resolveSlugInProject(signalRepo, config.projectId, result.slug)
          if (signalId !== null)
            out.push({
              commitId: commit.id,
              match: { projectId: config.projectId, signalId, action: result.action, sources: result.sources },
            })
        }
      }
    }
    return out
  })

export const assembleCommitInputs = (commits: readonly { readonly message: string }[]): MatchTextInput[] =>
  commits.map((commit) => ({ source: "commitMessage", text: commit.message }))

export const assemblePrInputs = (
  sources: GithubSyncSources,
  pr: { readonly title: string; readonly body: string | null; readonly headRef: string },
): MatchTextInput[] => {
  const inputs: MatchTextInput[] = []
  if (sources.prTitle && pr.title) inputs.push({ source: "prTitle", text: pr.title })
  if (sources.prBody && pr.body) inputs.push({ source: "prBody", text: pr.body })
  if (sources.branchName && pr.headRef) inputs.push({ source: "branchName", text: pr.headRef })
  return inputs
}

/**
 * Applies the resolve/unresolve intents carried by a set of references, batched per
 * `(project, command)` through the shipped lifecycle command (`keepMonitoring`
 * omitted → the settings cascade decides, 5.10). References whose action is
 * `reference`, or that already carry an `action_applied_at`, are skipped
 * (idempotent). Each applied reference is stamped with `appliedAt`.
 */
export const applyReferenceActions = (input: {
  readonly references: readonly GithubSignalReference[]
  readonly now: Date
}) =>
  Effect.gen(function* () {
    const referenceRepo = yield* GithubSignalReferenceRepository
    const byProject = new Map<ProjectId, { resolve: GithubSignalReference[]; unresolve: GithubSignalReference[] }>()
    for (const reference of input.references) {
      if (reference.action === "reference" || reference.actionAppliedAt !== null) continue
      const bucket = byProject.get(reference.projectId) ?? { resolve: [], unresolve: [] }
      bucket[reference.action].push(reference)
      byProject.set(reference.projectId, bucket)
    }
    for (const [projectId, bucket] of byProject) {
      for (const command of ["unresolve", "resolve"] as const) {
        const references = bucket[command]
        if (references.length === 0) continue
        yield* applySignalLifecycleCommandUseCase({
          projectId,
          signalIds: [...new Set(references.map((l) => l.signalId))],
          command,
          now: input.now,
        })
        for (const reference of references)
          yield* referenceRepo.stampActionApplied({ id: reference.id, appliedAt: input.now })
      }
    }
  })

/** Derives the stored `pr_state` from the raw PR flags (5.8). */
export const derivePrState = (pr: {
  readonly merged: boolean
  readonly state: string
  readonly draft: boolean
}): GithubSignalReference["prState"] => {
  if (pr.merged) return "merged"
  if (pr.state === "closed") return "closed"
  if (pr.draft) return "draft"
  return "open"
}
