import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { GithubDeliveryStatus } from "../entities/github-delivery.ts"
import type { GithubSignalReference } from "../entities/github-signal-reference.ts"
import {
  GithubDeliveryRepository,
  GithubIntegrationRepository,
  GithubSignalReferenceRepository,
  type GithubSignalReferenceUpsert,
} from "../ports/repositories.ts"
import {
  applyReferenceActions,
  assemblePrInputs,
  derivePrState,
  isTrustedPrAuthor,
  type ResolvedMatch,
  resolveMatchesForConfigs,
  resolveWatchingConfigs,
} from "./github-processing-helpers.ts"

export interface ProcessGithubPullRequestInput {
  readonly organizationId: OrganizationId
  readonly integrationId: string
  readonly deliveryId: string
  readonly repoId: number
  readonly repoFullName: string
  readonly action: string
  readonly prNumber: number
  readonly title: string
  readonly body: string | null
  readonly state: string
  readonly draft: boolean
  readonly merged: boolean
  readonly mergeCommitSha: string | null
  readonly mergedAt: string | null
  readonly headRef: string
  readonly headSha: string
  readonly headRepoId: number | null
  readonly baseRef: string
  readonly htmlUrl: string
  readonly userLogin: string
  readonly authorAssociation: string
  /** Present only on `edited` retargets — the previous base ref. */
  readonly changesBaseRef: string | null
  readonly now?: Date
}

export interface ProcessGithubEventResult {
  readonly status: GithubDeliveryStatus | "duplicate"
  readonly skipReason?: string
}

const REVERTS_PATTERN = /\bReverts\s+([\w.-]+\/[\w.-]+)#(\d+)/i

/**
 * The `pull_request` pipeline (5.8): resolves the watching configs for the base
 * branch, matches the enabled PR sources, and upserts/recomputes references per
 * project — gated pre-merge by the fork-PR trust gate (D13). On merge it stamps
 * the attribution keys on the delivery ledger (always, 5.9), flips state, absorbs
 * standalone commit references, applies resolve/unresolve actions (5.10), and honors
 * the revert convention (5.8 ⑤). Idempotent at every layer.
 */
export const processGithubPullRequestUseCase = (input: ProcessGithubPullRequestInput) =>
  Effect.gen(function* () {
    const now = input.now ?? new Date()
    const deliveryRepo = yield* GithubDeliveryRepository
    const integrationRepo = yield* GithubIntegrationRepository
    const referenceRepo = yield* GithubSignalReferenceRepository

    const claim = yield* deliveryRepo.claim({
      deliveryId: input.deliveryId,
      integrationId: input.integrationId,
      event: "pull_request",
      action: input.action,
      repoId: input.repoId,
    })
    if (!claim.claimed || claim.id === null) return { status: "duplicate" } satisfies ProcessGithubEventResult
    const ledgerId = claim.id

    const active = yield* integrationRepo.findActiveByOrganizationId()
    if (!active) {
      yield* deliveryRepo.finalize({ id: ledgerId, status: "skipped", skipReason: "revoked" })
      return { status: "skipped", skipReason: "revoked" } satisfies ProcessGithubEventResult
    }
    if (active.suspendedAt) {
      yield* deliveryRepo.finalize({ id: ledgerId, status: "skipped", skipReason: "suspended" })
      return { status: "skipped", skipReason: "suspended" } satisfies ProcessGithubEventResult
    }

    const isMerged = input.action === "closed" && input.merged
    const configs = (yield* resolveWatchingConfigs({
      integrationId: input.integrationId,
      repoId: input.repoId,
      branch: input.baseRef,
    })).filter((config) => config.monitorPullRequests)

    const mergedAt = input.mergedAt ? new Date(input.mergedAt) : now

    const baseLink = (
      match: ResolvedMatch,
      prState: GithubSignalReference["prState"],
    ): GithubSignalReferenceUpsert => ({
      organizationId: input.organizationId,
      projectId: match.projectId,
      signalId: match.signalId,
      integrationId: input.integrationId,
      repoId: input.repoId,
      repoFullName: input.repoFullName,
      referenceType: "pull_request",
      prNumber: input.prNumber,
      prState,
      commitSha: null,
      pushAfterSha: null,
      title: input.title,
      url: input.htmlUrl,
      authorLogin: input.userLogin,
      matchedSources: match.sources,
      action: match.action,
      mergedAt: prState === "merged" ? mergedAt : null,
    })

    // MERGED — actions fire here, and the join keys are stamped even with zero matches (5.9).
    if (isMerged) {
      if (configs.length > 0) {
        const desired = yield* resolveMatchesForConfigs({
          configs,
          buildInputs: (c) => assemblePrInputs(c.sources, input),
        })
        for (const match of desired) yield* referenceRepo.upsert(baseLink(match, "merged"))
        yield* absorbCommitReferences({ input, mergedAt })
        yield* applyRevertConvention({ input, now })
        yield* referenceRepo.setPrState({ repoId: input.repoId, prNumber: input.prNumber, prState: "merged", mergedAt })
        const references = yield* referenceRepo.listByPr({ repoId: input.repoId, prNumber: input.prNumber })
        yield* applyReferenceActions({ references, now })
      }
      yield* deliveryRepo.finalize({
        id: ledgerId,
        status: "processed",
        prNumber: input.prNumber,
        mergeCommitSha: input.mergeCommitSha,
        headSha: input.headSha,
      })
      return { status: "processed" } satisfies ProcessGithubEventResult
    }

    // CLOSED without merge — only flip state, never act.
    if (input.action === "closed") {
      yield* referenceRepo.setPrState({ repoId: input.repoId, prNumber: input.prNumber, prState: "closed" })
      yield* deliveryRepo.finalize({ id: ledgerId, status: "processed" })
      return { status: "processed" } satisfies ProcessGithubEventResult
    }

    const isRetarget = input.action === "edited" && input.changesBaseRef !== null
    if (configs.length === 0 && !isRetarget) {
      yield* deliveryRepo.finalize({ id: ledgerId, status: "skipped", skipReason: "no-config" })
      return { status: "skipped", skipReason: "no-config" } satisfies ProcessGithubEventResult
    }

    // Untrusted fork PRs get no pre-merge references; they reference (and act) at merge (D13).
    if (!isTrustedPrAuthor(input)) {
      yield* deliveryRepo.finalize({ id: ledgerId, status: "skipped", skipReason: "untrusted-fork" })
      return { status: "skipped", skipReason: "untrusted-fork" } satisfies ProcessGithubEventResult
    }

    const prState = derivePrState(input)
    const desired = yield* resolveMatchesForConfigs({ configs, buildInputs: (c) => assemblePrInputs(c.sources, input) })
    for (const match of desired) yield* referenceRepo.upsert(baseLink(match, prState))

    // `edited` (incl. retarget) recomputes: drop references that no longer match, unless an action was applied (D8/D10).
    if (input.action === "edited") {
      const desiredSignals = new Set(desired.map((m) => m.signalId))
      for (const reference of yield* referenceRepo.listByPr({ repoId: input.repoId, prNumber: input.prNumber })) {
        if (!desiredSignals.has(reference.signalId) && reference.actionAppliedAt === null)
          yield* referenceRepo.deleteById(reference.id)
      }
    }

    yield* deliveryRepo.finalize({ id: ledgerId, status: "processed" })
    return { status: "processed" } satisfies ProcessGithubEventResult
  })

/** Folds every commit reference this merge explains (5.9) into a PR reference, preserving applied provenance, then deletes it. */
const absorbCommitReferences = (params: { input: ProcessGithubPullRequestInput; mergedAt: Date }) =>
  Effect.gen(function* () {
    const referenceRepo = yield* GithubSignalReferenceRepository
    const { input } = params
    const commitReferences = yield* referenceRepo.findAbsorbableCommitReferences({
      repoId: input.repoId,
      mergeCommitSha: input.mergeCommitSha,
      headSha: input.headSha,
    })
    for (const commitReference of commitReferences) {
      const existing = (yield* referenceRepo.listByPr({ repoId: input.repoId, prNumber: input.prNumber })).find(
        (l) => l.signalId === commitReference.signalId,
      )
      const sources = [...new Set([...(existing?.matchedSources ?? []), ...commitReference.matchedSources])]
      const folded = yield* referenceRepo.upsert({
        organizationId: input.organizationId,
        projectId: commitReference.projectId,
        signalId: commitReference.signalId,
        integrationId: input.integrationId,
        repoId: input.repoId,
        repoFullName: input.repoFullName,
        referenceType: "pull_request",
        prNumber: input.prNumber,
        prState: "merged",
        commitSha: null,
        pushAfterSha: null,
        title: input.title,
        url: input.htmlUrl,
        authorLogin: input.userLogin,
        matchedSources: sources,
        action: existing?.action ?? commitReference.action,
        mergedAt: params.mergedAt,
      })
      // Carry applied provenance only when the folded action is the one the commit
      // already applied. If the merged PR resolved to a different action, leave the
      // row unapplied so applyReferenceActions runs the PR's authoritative action.
      if (
        commitReference.actionAppliedAt !== null &&
        folded.actionAppliedAt === null &&
        folded.action === commitReference.action
      )
        yield* referenceRepo.stampActionApplied({ id: folded.id, appliedAt: commitReference.actionAppliedAt })
      yield* referenceRepo.deleteById(commitReference.id)
    }
  })

/** `Reverts owner/repo#N` on a merged PR → unresolve the signals PR #N resolved, recording references on the reverting PR (5.8 ⑤). */
const applyRevertConvention = (params: { input: ProcessGithubPullRequestInput; now: Date }) =>
  Effect.gen(function* () {
    const { input } = params
    if (input.body === null) return
    const match = REVERTS_PATTERN.exec(input.body)
    if (!match || match[1]?.toLowerCase() !== input.repoFullName.toLowerCase()) return
    const revertedPrNumber = Number(match[2])
    if (!Number.isInteger(revertedPrNumber)) return

    const referenceRepo = yield* GithubSignalReferenceRepository
    const revertedReferences = (yield* referenceRepo.listByPr({
      repoId: input.repoId,
      prNumber: revertedPrNumber,
    })).filter((l) => l.action === "resolve" && l.actionAppliedAt !== null)
    for (const reverted of revertedReferences) {
      yield* referenceRepo.upsert({
        organizationId: input.organizationId,
        projectId: reverted.projectId,
        signalId: reverted.signalId,
        integrationId: input.integrationId,
        repoId: input.repoId,
        repoFullName: input.repoFullName,
        referenceType: "pull_request",
        prNumber: input.prNumber,
        prState: "merged",
        commitSha: null,
        pushAfterSha: null,
        title: input.title,
        url: input.htmlUrl,
        authorLogin: input.userLogin,
        matchedSources: [],
        action: "unresolve",
        mergedAt: input.mergedAt ? new Date(input.mergedAt) : params.now,
      })
    }
  })
