import { OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import {
  createShowcase,
  SHOWCASE_SINGLETON_ID,
  type Showcase,
  ShowcaseNotFoundError,
  ShowcaseNotReadyError,
  ShowcaseRepository,
} from "@domain/showcase"
import { and, eq, isNotNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { showcase } from "../schema/showcase.ts"

const toDomainShowcase = (row: typeof showcase.$inferSelect): Showcase =>
  createShowcase({
    organizationId: OrganizationId(row.organizationId),
    currentProjectId: row.currentProjectId ? ProjectId(row.currentProjectId) : null,
    nextProjectId: row.nextProjectId ? ProjectId(row.nextProjectId) : null,
    nextState: row.nextState,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (entity: Showcase) => ({
  id: entity.id,
  organizationId: entity.organizationId,
  currentProjectId: entity.currentProjectId,
  nextProjectId: entity.nextProjectId,
  nextState: entity.nextState,
})

/**
 * Live layer for the singleton showcase pointer. The table has no RLS policy
 * (system/config table), so reads/writes don't lean on the organization
 * context — they operate on the single `id = 1` row directly.
 */
export const ShowcaseRepositoryLive = Layer.effect(
  ShowcaseRepository,
  Effect.gen(function* () {
    return {
      find: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) => db.select().from(showcase).limit(1))
            .pipe(Effect.map(([row]) => (row ? toDomainShowcase(row) : null)))
        }),

      create: (entity) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) => db.insert(showcase).values(toInsertRow(entity)).returning())
            .pipe(Effect.map(([row]) => (row ? toDomainShowcase(row) : entity)))
        }),

      beginNextBuild: (nextProjectId: ProjectId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [row] = yield* sqlClient.query((db) =>
            db
              .update(showcase)
              .set({ nextProjectId, nextState: "building", updatedAt: new Date() })
              .where(eq(showcase.id, SHOWCASE_SINGLETON_ID))
              .returning(),
          )
          if (!row) return yield* Effect.fail(new ShowcaseNotFoundError())
          return toDomainShowcase(row)
        }),

      markNextReady: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Guard `next_project_id IS NOT NULL` in the WHERE so an idle pointer
          // (no build in flight) matches no row and the UPDATE has no effect —
          // rather than writing an inconsistent `ready` + null-`next` and failing
          // after the side effect. No row updated → nothing to gate.
          const [row] = yield* sqlClient.query((db) =>
            db
              .update(showcase)
              .set({ nextState: "ready", updatedAt: new Date() })
              .where(and(eq(showcase.id, SHOWCASE_SINGLETON_ID), isNotNull(showcase.nextProjectId)))
              .returning(),
          )
          if (!row) return yield* Effect.fail(new ShowcaseNotFoundError())
          return toDomainShowcase(row)
        }),

      reclaimStaleBuild: (staleBefore: Date) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient.transaction(
            Effect.gen(function* () {
              // Lock the pointer so the staleness check and the reset can't race a
              // concurrent swap / begin-build (same `FOR UPDATE` discipline as swap).
              const [locked] = yield* sqlClient.query((db) =>
                db.select().from(showcase).where(eq(showcase.id, SHOWCASE_SINGLETON_ID)).for("update"),
              )
              if (!locked) return yield* Effect.fail(new ShowcaseNotFoundError())

              if (locked.nextState !== "building" || !locked.nextProjectId || locked.updatedAt >= staleBefore) {
                return { showcase: toDomainShowcase(locked), reclaimedProjectId: null }
              }

              const reclaimedProjectId = ProjectId(locked.nextProjectId)
              const [reset] = yield* sqlClient.query((db) =>
                db
                  .update(showcase)
                  .set({ nextProjectId: null, nextState: null, updatedAt: new Date() })
                  .where(eq(showcase.id, SHOWCASE_SINGLETON_ID))
                  .returning(),
              )
              if (!reset) return yield* Effect.fail(new ShowcaseNotFoundError())
              return { showcase: toDomainShowcase(reset), reclaimedProjectId }
            }),
          )
        }),

      swap: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient.transaction(
            Effect.gen(function* () {
              // Serialize competing swaps (manual backoffice vs. scheduled) on the
              // singleton row: the lock is held until this transaction commits, so
              // a second swap blocks here, then observes the post-swap `idle` state.
              const [locked] = yield* sqlClient.query((db) =>
                db.select().from(showcase).where(eq(showcase.id, SHOWCASE_SINGLETON_ID)).for("update"),
              )
              if (!locked) return yield* Effect.fail(new ShowcaseNotFoundError())
              if (locked.nextState !== "ready" || !locked.nextProjectId) {
                return yield* Effect.fail(new ShowcaseNotReadyError({ nextState: locked.nextState }))
              }

              // Promotes whatever `next` the pointer names — not a caller-supplied
              // project id — trusting that regeneration is strictly single-flight
              // (BullMQ per-job lock + the worker resuming rather than forking a
              // second `next`). If two regenerations ever overlapped, the gate
              // could run on project A while this promoted project B.
              const [swapped] = yield* sqlClient.query((db) =>
                db
                  .update(showcase)
                  .set({
                    currentProjectId: locked.nextProjectId,
                    nextProjectId: null,
                    nextState: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(showcase.id, SHOWCASE_SINGLETON_ID))
                  .returning(),
              )
              if (!swapped) return yield* Effect.fail(new ShowcaseNotFoundError())
              return toDomainShowcase(swapped)
            }),
          )
        }),
    }
  }),
)
