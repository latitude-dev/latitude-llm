import { OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import {
  type CacheFinding,
  CacheFindingRepository,
  type CacheFindingSignalStatus,
  cacheFindingSchema,
} from "@domain/signals"
import { and, eq, inArray } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { cacheFindings } from "../schema/cache-findings.ts"
import { signals } from "../schema/signals.ts"

const toFinding = (row: typeof cacheFindings.$inferSelect): CacheFinding =>
  cacheFindingSchema.parse({
    id: row.id,
    organizationId: OrganizationId(row.organizationId),
    projectId: ProjectId(row.projectId),
    signalId: row.signalId,
    fingerprint: row.fingerprint,
    measures: {
      provider: row.provider,
      model: row.model,
      state: row.state,
      urgency: row.urgency,
      actualRate: row.actualRate,
      breakEvenRate: row.breakEvenRate,
      ceilingRate: row.ceilingRate,
      modeledSavingsMicrocents: row.modeledSavingsMicrocents,
      calls: row.calls,
      spendMicrocents: row.spendMicrocents,
      cacheLifetimeSeconds: row.cacheLifetimeSeconds,
    },
    firstObservedAt: row.firstObservedAt,
    lastObservedAt: row.lastObservedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

export const CacheFindingRepositoryLive = Layer.effect(
  CacheFindingRepository,
  Effect.gen(function* () {
    return {
      listByProject: ({ projectId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Left-joined and unfiltered: the caller needs archived rows to stay quiet on a
          // decision someone made, and a soft-deleted signal must still surface its row so
          // the finding can take it over rather than orphan a fresh signal.
          const rows = yield* sqlClient.query((db, organizationId) =>
            db
              .select({
                finding: cacheFindings,
                signalSlug: signals.slug,
                resolvedAt: signals.resolvedAt,
                ignoredAt: signals.ignoredAt,
                deletedAt: signals.deletedAt,
              })
              .from(cacheFindings)
              .leftJoin(
                signals,
                and(eq(signals.organizationId, cacheFindings.organizationId), eq(signals.id, cacheFindings.signalId)),
              )
              .where(and(eq(cacheFindings.organizationId, organizationId), eq(cacheFindings.projectId, projectId))),
          )
          return rows.map((row) => {
            const signalStatus: CacheFindingSignalStatus =
              row.signalSlug === null || row.deletedAt !== null
                ? "gone"
                : row.resolvedAt !== null || row.ignoredAt !== null
                  ? "archived"
                  : "open"
            return { ...toFinding(row.finding), signalSlug: row.signalSlug, signalStatus }
          })
        }),

      findBySignalId: ({ signalId }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db, organizationId) =>
            db
              .select()
              .from(cacheFindings)
              .where(and(eq(cacheFindings.organizationId, organizationId), eq(cacheFindings.signalId, signalId)))
              .limit(1),
          )
          return row ? toFinding(row) : null
        }),

      upsert: (finding) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const measures = finding.measures
          yield* sqlClient.query((db, organizationId) =>
            db
              .insert(cacheFindings)
              .values({
                id: finding.id,
                organizationId,
                projectId: finding.projectId,
                signalId: finding.signalId,
                fingerprint: finding.fingerprint,
                provider: measures.provider,
                model: measures.model,
                state: measures.state,
                urgency: measures.urgency,
                actualRate: measures.actualRate,
                breakEvenRate: measures.breakEvenRate,
                ceilingRate: measures.ceilingRate,
                modeledSavingsMicrocents: Math.round(measures.modeledSavingsMicrocents),
                calls: measures.calls,
                spendMicrocents: Math.round(measures.spendMicrocents),
                cacheLifetimeSeconds: measures.cacheLifetimeSeconds,
                firstObservedAt: finding.firstObservedAt,
                lastObservedAt: finding.lastObservedAt,
                createdAt: finding.createdAt,
                updatedAt: finding.updatedAt,
              })
              // `firstObservedAt` deliberately absent: a finding that keeps being true is the
              // same finding, opened once, and its age is what says whether anyone acted.
              .onConflictDoUpdate({
                target: [cacheFindings.organizationId, cacheFindings.projectId, cacheFindings.fingerprint],
                set: {
                  signalId: finding.signalId,
                  actualRate: measures.actualRate,
                  breakEvenRate: measures.breakEvenRate,
                  ceilingRate: measures.ceilingRate,
                  modeledSavingsMicrocents: Math.round(measures.modeledSavingsMicrocents),
                  calls: measures.calls,
                  spendMicrocents: Math.round(measures.spendMicrocents),
                  cacheLifetimeSeconds: measures.cacheLifetimeSeconds,
                  urgency: measures.urgency,
                  lastObservedAt: finding.lastObservedAt,
                  updatedAt: finding.updatedAt,
                },
              }),
          )
        }),

      deleteBySignalIds: ({ projectId, signalIds }) =>
        Effect.gen(function* () {
          if (signalIds.length === 0) return
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db
              .delete(cacheFindings)
              .where(
                and(
                  eq(cacheFindings.organizationId, organizationId),
                  eq(cacheFindings.projectId, projectId),
                  inArray(cacheFindings.signalId, [...signalIds]),
                ),
              ),
          )
        }),
    }
  }),
)
