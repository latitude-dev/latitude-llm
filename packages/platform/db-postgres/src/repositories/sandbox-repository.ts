import type { Sandbox } from "@domain/sandboxes"
import { SandboxRepository } from "@domain/sandboxes"
import { OrganizationId, SqlClient, type SqlClientShape } from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { sandboxes } from "../schema/sandboxes.ts"

const toDomainSandbox = (row: typeof sandboxes.$inferSelect): Sandbox => ({
  id: row.id,
  organizationId: OrganizationId(row.organizationId),
  status: row.status,
  lastActivityAt: row.lastActivityAt,
  createdByUserId: row.createdByUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export const SandboxRepositoryLive = Layer.effect(
  SandboxRepository,
  Effect.gen(function* () {
    return {
      findOptional: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db.select().from(sandboxes).where(eq(sandboxes.organizationId, organizationId)).limit(1),
            )
            .pipe(Effect.map((results) => (results[0] ? toDomainSandbox(results[0]) : null)))
        }),

      stampActivity: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const now = new Date()
          yield* sqlClient.query((db, organizationId) =>
            db
              .update(sandboxes)
              .set({ lastActivityAt: now, updatedAt: now })
              .where(eq(sandboxes.organizationId, organizationId)),
          )
        }),
    }
  }),
)
