import type { EvaluationRepository } from "@domain/evaluations"
import { OutboxEventWriter } from "@domain/events"
import { ProjectRepository } from "@domain/projects"
import {
  type ConcurrentSqlTransactionError,
  generateId,
  type NotFoundError,
  type OrganizationId,
  type ProjectId,
  RepositoryError,
  type SettingsReader,
  SignalId,
  SqlClient,
} from "@domain/shared"
import type { JudgedCacheModel } from "@domain/spans"
import { reviewCacheFindings } from "@domain/spans"
import { Effect } from "effect"
import { describeCacheFinding } from "../cache-finding-copy.ts"
import { cacheFindingSchema } from "../entities/cache-finding.ts"
import { signalSchema } from "../entities/signal.ts"
import { CacheFindingRepository } from "../ports/cache-finding-repository.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { generateSignalSlug, type SignalSlugGenerationError } from "../slug.ts"
import { applySignalLifecycleCommandUseCase } from "./apply-signal-lifecycle-command.ts"

export interface SyncCacheFindingSignalsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /**
   * One `judgeCacheEconomics` result per stability window, **newest first**. The
   * stability gate reads them as a series, so the order is part of the contract.
   */
  readonly windows: readonly (readonly JudgedCacheModel[])[]
  readonly now?: Date
}

export interface SyncCacheFindingSignalsResult {
  readonly opened: readonly string[]
  readonly refreshed: readonly string[]
  readonly resolved: readonly string[]
  /** Findings still true whose signal a user resolved or ignored, left deliberately alone. */
  readonly skippedArchived: number
  /** Verdicts the panel shows that did not become signals, by the gate that held them. */
  readonly suppressed: Readonly<Record<string, number>>
}

export type SyncCacheFindingSignalsError =
  | ConcurrentSqlTransactionError
  | NotFoundError
  | RepositoryError
  | SignalSlugGenerationError

const countSuppressions = (
  suppressed: readonly { readonly suppressedBy: string }[],
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = {}
  for (const entry of suppressed) counts[entry.suppressedBy] = (counts[entry.suppressedBy] ?? 0) + 1
  return counts
}

/**
 * Turn the cache findings a project's traffic supports into signals, and retire the ones
 * whose finding has cleared.
 *
 * The judgment itself is not made here: `windows` already carries it, produced by the
 * same `judgeCacheEconomics` the cost dashboard reads and gated by the same
 * `reviewCacheFindings`. This use case owns only the lifecycle — open once, stay quiet
 * while it persists, resolve when it clears — so there is no second place a verdict can
 * be computed and drift from the panel.
 *
 * Fire-once is enforced by the database rather than by the read above it:
 * `cache_findings` carries a unique index on `(organization_id, project_id,
 * fingerprint)`, so two concurrent sweeps cannot both open a signal for one finding.
 */
export const syncCacheFindingSignalsUseCase = (input: SyncCacheFindingSignalsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    const now = input.now ?? new Date()
    const review = reviewCacheFindings(input.windows)
    const sqlClient = yield* SqlClient

    const { opened, refreshed, skipped, stale } = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const findings = yield* CacheFindingRepository
        const signals = yield* SignalRepository
        const projects = yield* ProjectRepository
        const outbox = yield* OutboxEventWriter

        const existingRows = yield* findings.listByProject({ projectId: input.projectId })
        const byFingerprint = new Map(existingRows.map((finding) => [finding.fingerprint, finding]))
        const openedIds: string[] = []
        const refreshedIds: string[] = []
        let skippedArchived = 0
        const needsSignal = review.findings.filter(
          (finding) => byFingerprint.get(finding.fingerprint)?.signalStatus !== "open",
        )
        const project = needsSignal.length > 0 ? yield* projects.findById(input.projectId) : null

        for (const finding of review.findings) {
          const existing = byFingerprint.get(finding.fingerprint)

          // Someone resolved or ignored this one. The traffic that produced it has not
          // changed, so it is still firing and will be tomorrow too — opening another
          // signal would argue with that decision every single sweep. The row stays as
          // the tombstone, untouched, and a genuinely new *state* is a different
          // fingerprint that gets its own signal.
          if (existing?.signalStatus === "archived") {
            skippedArchived++
            continue
          }

          if (existing?.signalStatus === "open") {
            yield* findings.upsert({ ...existing, measures: finding.measures, lastObservedAt: now, updatedAt: now })
            refreshedIds.push(existing.signalId)
            continue
          }
          if (project === null) continue

          const slug = yield* generateSignalSlug({
            projectSlug: project.slug,
            count: (candidate) => signals.countBySlug({ slug: candidate }),
          })
          const copy = describeCacheFinding(finding.measures)
          const signal = signalSchema.parse({
            id: generateId(),
            organizationId: input.organizationId,
            projectId: input.projectId,
            slug,
            name: copy.name,
            description: copy.description,
            source: "cost",
            origin: "system",
            filters: null,
            assigneeId: null,
            priority: null,
            // A cost finding is measured, not clustered from score feedback, so it
            // contributes nothing to the embedding space and must not be matched in it.
            centroid: null,
            clusteredAt: null,
            resolvedAt: null,
            ignoredAt: null,
            regressedAt: null,
            mutedAt: null,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          yield* signals.save(signal)
          // `signalId` moves on conflict, so a finding whose signal was deleted takes its
          // own row over instead of leaving the new signal unlinked.
          yield* findings.upsert(
            cacheFindingSchema.parse({
              id: existing?.id ?? generateId(),
              organizationId: input.organizationId,
              projectId: input.projectId,
              signalId: signal.id,
              fingerprint: finding.fingerprint,
              measures: finding.measures,
              firstObservedAt: existing?.firstObservedAt ?? now,
              lastObservedAt: now,
              createdAt: existing?.createdAt ?? now,
              updatedAt: now,
            }),
          )
          // The existing rail: `SignalCreated` is what fans out to the agent-dispatch
          // request and the discovery notification, so a cost finding reaches both
          // without a second publisher.
          yield* outbox
            .write({
              eventName: "SignalCreated",
              aggregateType: "issue",
              aggregateId: signal.id,
              organizationId: signal.organizationId,
              payload: {
                organizationId: signal.organizationId,
                projectId: signal.projectId,
                signalId: signal.id,
                createdAt: signal.createdAt.toISOString(),
              },
            })
            .pipe(Effect.mapError((cause) => new RepositoryError({ operation: "OutboxEventWriter.write", cause })))
          openedIds.push(signal.id)
        }

        const stillFiring = new Set(review.findings.map((finding) => finding.fingerprint))
        return {
          opened: openedIds,
          refreshed: refreshedIds,
          skipped: skippedArchived,
          stale: existingRows.filter((finding) => !stillFiring.has(finding.fingerprint)),
        }
      }),
    )

    // Archive first, drop the projection second, one finding at a time.
    //
    // The order is the whole point: deleting the row first and resolving afterwards leaves
    // a signal open in the inbox with nothing left to find it by, and no later sweep can
    // recover it. This way a crash between the two steps leaves an archived signal whose
    // row is still there, which the next sweep sees as already-archived-and-not-firing and
    // deletes. Errors are caught per finding so one bad row cannot strand the rest.
    const resolved: string[] = []
    for (const finding of stale) {
      const signalId = SignalId(finding.signalId)
      const archived = yield* Effect.gen(function* () {
        if (finding.signalStatus === "open") {
          yield* applySignalLifecycleCommandUseCase({
            projectId: input.projectId,
            signalIds: [signalId],
            command: "resolve",
            // Nothing is ever linked to a cost finding, so there is no monitoring to stop;
            // passing it explicitly keeps the project-settings read off this path.
            keepMonitoring: true,
            now,
          })
          return true
        }
        return false
      }).pipe(
        // A signal that vanished under us is already archived as far as this is concerned.
        Effect.catchTag("NotFoundError", () => Effect.succeed(false)),
        Effect.catch(() => Effect.succeed(null)),
      )
      if (archived === null) continue

      yield* sqlClient
        .transaction(
          Effect.gen(function* () {
            const findings = yield* CacheFindingRepository
            yield* findings.deleteBySignalIds({ projectId: input.projectId, signalIds: [signalId] })
          }),
        )
        .pipe(Effect.catch(() => Effect.void))
      if (archived) resolved.push(signalId)
    }

    return {
      opened,
      refreshed,
      resolved,
      skippedArchived: skipped,
      suppressed: countSuppressions(review.suppressed),
    } satisfies SyncCacheFindingSignalsResult
  }).pipe(Effect.withSpan("signals.syncCacheFindingSignals")) as Effect.Effect<
    SyncCacheFindingSignalsResult,
    SyncCacheFindingSignalsError,
    | CacheFindingRepository
    | EvaluationRepository
    | OutboxEventWriter
    | ProjectRepository
    | SettingsReader
    | SignalRepository
    | SqlClient
  >
