import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { GithubSignalReference } from "../entities/github-signal-reference.ts"
import {
  GithubDeliveryRepository,
  GithubIntegrationRepository,
  GithubSignalReferenceRepository,
} from "../ports/repositories.ts"
import {
  applyReferenceActions,
  assembleCommitInputs,
  resolveCommitMatches,
  resolveMatchesForConfigs,
  resolveWatchingConfigs,
} from "./github-processing-helpers.ts"
import type { ProcessGithubEventResult } from "./process-github-pull-request.ts"

export interface ProcessGithubPushCommit {
  readonly id: string
  readonly message: string
  readonly timestamp: string
  readonly authorUsername: string | null
  readonly url: string
}

export interface ProcessGithubPushInput {
  readonly organizationId: OrganizationId
  readonly integrationId: string
  readonly deliveryId: string
  readonly repoId: number
  readonly repoFullName: string
  readonly ref: string
  readonly before: string
  readonly after: string
  readonly created: boolean
  readonly deleted: boolean
  readonly forced: boolean
  readonly commits: readonly ProcessGithubPushCommit[]
  readonly truncated: boolean
  readonly now?: Date
}

const BRANCH_REF_PREFIX = "refs/heads/"

const firstLine = (message: string): string => (message.split("\n")[0] ?? message).trim() || message

const derivePrUrl = (commitUrl: string | null, prNumber: number, repoFullName: string): string => {
  if (commitUrl) {
    const derived = commitUrl.replace(/\/commit\/[0-9a-f]+$/i, `/pull/${prNumber}`)
    if (derived !== commitUrl) return derived
  }
  return `https://github.com/${repoFullName}/pull/${prNumber}`
}

/**
 * The `push` pipeline (5.8): branch-gates, then either folds an attributed
 * PR-merge push into the PR (5.9 — no commit references) or creates standalone commit
 * references and applies their actions immediately (a commit on the configured branch
 * is already merged). Attribution is checked only when PRs are also monitored —
 * with PRs off there is nothing to duplicate.
 */
export const processGithubPushUseCase = (input: ProcessGithubPushInput) =>
  Effect.gen(function* () {
    const now = input.now ?? new Date()
    const deliveryRepo = yield* GithubDeliveryRepository
    const integrationRepo = yield* GithubIntegrationRepository
    const referenceRepo = yield* GithubSignalReferenceRepository

    const claim = yield* deliveryRepo.claim({
      deliveryId: input.deliveryId,
      integrationId: input.integrationId,
      event: "push",
      action: null,
      repoId: input.repoId,
    })
    if (!claim.claimed || claim.id === null) return { status: "duplicate" } satisfies ProcessGithubEventResult
    const ledgerId = claim.id

    const finalizeSkip = (skipReason: string) =>
      deliveryRepo
        .finalize({ id: ledgerId, status: "skipped", skipReason, truncated: input.truncated })
        .pipe(Effect.as({ status: "skipped", skipReason } satisfies ProcessGithubEventResult))

    const active = yield* integrationRepo.findActiveByOrganizationId()
    if (!active) return yield* finalizeSkip("revoked")
    if (active.suspendedAt) return yield* finalizeSkip("suspended")
    if (input.deleted) return yield* finalizeSkip("branch-deleted")
    if (!input.ref.startsWith(BRANCH_REF_PREFIX)) return yield* finalizeSkip("non-branch-ref")

    const branch = input.ref.slice(BRANCH_REF_PREFIX.length)
    const configs = (yield* resolveWatchingConfigs({
      integrationId: input.integrationId,
      repoId: input.repoId,
      branch,
    })).filter((config) => config.monitorCommits)
    if (configs.length === 0) return yield* finalizeSkip("no-config")

    const attribution = configs.some((c) => c.monitorPullRequests)
      ? yield* deliveryRepo.findMergeByShas({
          repoId: input.repoId,
          shas: [input.after, ...input.commits.map((c) => c.id)],
        })
      : null

    if (attribution !== null) {
      const matches = yield* resolveMatchesForConfigs({
        configs,
        buildInputs: () => assembleCommitInputs(input.commits),
      })
      const existing = yield* referenceRepo.listByPr({ repoId: input.repoId, prNumber: attribution.prNumber })
      const mergedAt = input.commits.length > 0 ? new Date(input.commits[input.commits.length - 1]!.timestamp) : now
      for (const match of matches) {
        const existingReference = existing.find((l) => l.signalId === match.signalId)
        yield* referenceRepo.upsert({
          organizationId: input.organizationId,
          projectId: match.projectId,
          signalId: match.signalId,
          integrationId: input.integrationId,
          repoId: input.repoId,
          repoFullName: input.repoFullName,
          referenceType: "pull_request",
          prNumber: attribution.prNumber,
          prState: "merged",
          commitSha: null,
          pushAfterSha: null,
          title:
            existingReference?.title ??
            firstLine(input.commits[0]?.message ?? `${input.repoFullName}#${attribution.prNumber}`),
          url:
            existingReference?.url ??
            derivePrUrl(input.commits[0]?.url ?? null, attribution.prNumber, input.repoFullName),
          authorLogin: existingReference?.authorLogin ?? input.commits[0]?.authorUsername ?? null,
          matchedSources: [...new Set([...(existingReference?.matchedSources ?? []), ...match.sources])],
          action: existingReference?.action ?? match.action,
          mergedAt,
        })
      }
      const references = yield* referenceRepo.listByPr({ repoId: input.repoId, prNumber: attribution.prNumber })
      yield* applyReferenceActions({ references, now })
      yield* deliveryRepo.finalize({ id: ledgerId, status: "processed", truncated: input.truncated })
      return { status: "processed" } satisfies ProcessGithubEventResult
    }

    const commitMatches = yield* resolveCommitMatches({ configs, commits: input.commits })
    const upserted: GithubSignalReference[] = []
    for (const { commitId, match } of commitMatches) {
      const commit = input.commits.find((c) => c.id === commitId)
      if (!commit) continue
      upserted.push(
        yield* referenceRepo.upsert({
          organizationId: input.organizationId,
          projectId: match.projectId,
          signalId: match.signalId,
          integrationId: input.integrationId,
          repoId: input.repoId,
          repoFullName: input.repoFullName,
          referenceType: "commit",
          prNumber: null,
          prState: null,
          commitSha: commit.id,
          pushAfterSha: input.after,
          title: firstLine(commit.message),
          url: commit.url,
          authorLogin: commit.authorUsername,
          matchedSources: match.sources,
          action: match.action,
          mergedAt: new Date(commit.timestamp),
        }),
      )
    }
    yield* applyReferenceActions({ references: upserted, now })
    yield* deliveryRepo.finalize({ id: ledgerId, status: "processed", truncated: input.truncated })
    return { status: "processed" } satisfies ProcessGithubEventResult
  })
