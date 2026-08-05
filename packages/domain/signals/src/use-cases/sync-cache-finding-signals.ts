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

    const { opened, refreshed, staleSignalIds } = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const findings = yield* CacheFindingRepository
        const signals = yield* SignalRepository
        const projects = yield* ProjectRepository
        const outbox = yield* OutboxEventWriter

        const open = yield* findings.listOpenByProject({ projectId: input.projectId })
        const openByFingerprint = new Map(open.map((finding) => [finding.fingerprint, finding]))
        const openedIds: string[] = []
        const refreshedIds: string[] = []
        const project = review.findings.length > 0 ? yield* projects.findById(input.projectId) : null

        for (const finding of review.findings) {
          const existing = openByFingerprint.get(finding.fingerprint)
          if (existing) {
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
          yield* findings.upsert(
            cacheFindingSchema.parse({
              id: generateId(),
              organizationId: input.organizationId,
              projectId: input.projectId,
              signalId: signal.id,
              fingerprint: finding.fingerprint,
              measures: finding.measures,
              firstObservedAt: now,
              lastObservedAt: now,
              createdAt: now,
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
        const stale = open.filter((finding) => !stillFiring.has(finding.fingerprint))
        if (stale.length > 0) {
          yield* findings.deleteBySignalIds({
            projectId: input.projectId,
            signalIds: stale.map((finding) => SignalId(finding.signalId)),
          })
        }

        return {
          opened: openedIds,
          refreshed: refreshedIds,
          staleSignalIds: stale.map((finding) => SignalId(finding.signalId)),
        }
      }),
    )

    // Resolved through the shared lifecycle use case, which owns its own transaction: a
    // cleared cost finding is archived exactly the way a person resolving it from the
    // inbox would be, rather than through a second write path that could diverge.
    const resolved: string[] = []
    for (const signalId of staleSignalIds) {
      const applied = yield* applySignalLifecycleCommandUseCase({
        projectId: input.projectId,
        signalIds: [signalId],
        command: "resolve",
        // Nothing is ever linked to a cost finding, so there is no monitoring to stop;
        // passing it explicitly keeps the project-settings read off this path.
        keepMonitoring: true,
        now,
      }).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      if (applied !== null) resolved.push(signalId)
    }

    return {
      opened,
      refreshed,
      resolved,
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
