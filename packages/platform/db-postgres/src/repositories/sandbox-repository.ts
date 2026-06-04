import type { Sandbox } from "@domain/sandboxes"
import { SandboxRepository } from "@domain/sandboxes"
import {
  NotFoundError,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  SandboxId,
  SqlClient,
  type SqlClientShape,
  UserId,
} from "@domain/shared"
import { and, eq, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { organizations } from "../schema/better-auth.ts"
import { sandboxes } from "../schema/sandboxes.ts"

const toDomainSandbox = (row: typeof sandboxes.$inferSelect): Sandbox => ({
  id: SandboxId(row.id),
  organizationId: OrganizationId(row.organizationId),
  status: row.status,
  lastActivityAt: row.lastActivityAt,
  createdByUserId: UserId(row.createdByUserId),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})
const toSandboxInsertRow = (sandbox: ReturnType<typeof toDomainSandbox>) => ({
  id: sandbox.id,
  organizationId: sandbox.organizationId,
  status: sandbox.status,
  lastActivityAt: sandbox.lastActivityAt,
  createdByUserId: sandbox.createdByUserId,
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
      create: (sandbox) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) => db.insert(sandboxes).values(toSandboxInsertRow(sandbox)))
        }),

      findByOrganizationId: (organizationId: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) => db.select().from(sandboxes).where(eq(sandboxes.organizationId, organizationId)).limit(1))
            .pipe(
              Effect.flatMap((rows) => {
                const [row] = rows
                if (!row) {
                  return Effect.fail(
                    new NotFoundError({
                      entity: "Sandbox",
                      id: organizationId,
                    }),
                  )
                }
                return Effect.succeed(toDomainSandbox(row))
              }),
            )
        }),

      countActiveByParentOrgId: (parentOrgId: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) =>
              db
                .select({ count: sql<number>`count(*)::int` })
                .from(sandboxes)
                .innerJoin(organizations, eq(organizations.id, sandboxes.organizationId))
                .where(and(eq(organizations.parentOrgId, parentOrgId), eq(sandboxes.status, "active"))),
            )
            .pipe(Effect.map((rows) => rows[0]?.count ?? 0))
        }),

      lockParentForCapCheck: (parentOrgId: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          // Transaction-scoped advisory lock keyed on the parent org id; blocks
          // until any concurrent holder's tx ends, serializing the cap check.
          yield* sqlClient.query((db) => db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parentOrgId}))`))
        }),

      setStatus: (organizationId: OrganizationIdType, status) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
            db
              .update(sandboxes)
              .set({ status, updatedAt: new Date() })
              .where(eq(sandboxes.organizationId, organizationId)),
          )
        }),

      delete: (organizationId: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) => db.delete(sandboxes).where(eq(sandboxes.organizationId, organizationId)))
        }),
    }
  }),
)
