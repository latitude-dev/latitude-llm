import { OrganizationId, ProjectId, SqlClient, type SqlClientShape } from "@domain/shared"
import { createShowcase, type Showcase, ShowcaseRepository } from "@domain/showcase"
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
    }
  }),
)
