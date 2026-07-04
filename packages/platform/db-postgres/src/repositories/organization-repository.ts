import { OrganizationRepository } from "@domain/organizations"
import {
  NotFoundError,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  type OrganizationSettings,
  SqlClient,
  type SqlClientShape,
  type UserId as UserIdType,
} from "@domain/shared"
import { and, eq, isNotNull, lt, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { members, organizations } from "../schema/better-auth.ts"

const toDomainOrganization = (row: typeof organizations.$inferSelect) => ({
  id: OrganizationId(row.id),
  name: row.name,
  slug: row.slug,
  logo: row.logo,
  metadata: row.metadata,
  settings: (row.settings as OrganizationSettings | null) ?? null,
  parentOrgId: row.parentOrgId ? OrganizationId(row.parentOrgId) : null,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toOrganizationInsertRow = (org: {
  id: string
  name: string
  slug: string
  logo: string | null
  metadata: string | null
  settings: OrganizationSettings | null
  parentOrgId: string | null
  expiresAt: Date | null
}) => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  logo: org.logo,
  metadata: org.metadata,
  settings: org.settings,
  parentOrgId: org.parentOrgId,
  expiresAt: org.expiresAt,
})

/**
 * Live layer that pulls db from SqlClient
 * Organization table doesn't have organization_id field, so it doesn't need RLS
 */
export const OrganizationRepositoryLive = Layer.effect(
  OrganizationRepository,
  Effect.gen(function* () {
    const listByUserId = (userId: UserIdType) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        return yield* sqlClient
          .query((db) =>
            db
              .select({ organization: organizations })
              .from(organizations)
              .innerJoin(members, eq(members.organizationId, organizations.id))
              .where(eq(members.userId, userId)),
          )
          .pipe(Effect.map((results) => results.map(({ organization: org }) => toDomainOrganization(org))))
      })

    return {
      findById: (id: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) => db.select().from(organizations).where(eq(organizations.id, id)).limit(1))
            .pipe(
              Effect.flatMap((results) => {
                const [result] = results
                if (!result) {
                  return Effect.fail(new NotFoundError({ entity: "Organization", id }))
                }
                return Effect.succeed(toDomainOrganization(result))
              }),
            )
        }),

      findByIdForUpdate: (id: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) =>
              db.select().from(organizations).where(eq(organizations.id, id)).limit(1).for("update"),
            )
            .pipe(
              Effect.flatMap((results) => {
                const [result] = results
                if (!result) {
                  return Effect.fail(new NotFoundError({ entity: "Organization", id }))
                }
                return Effect.succeed(toDomainOrganization(result))
              }),
            )
        }),

      listByUserId,

      save: (org: {
        id: string
        name: string
        slug: string
        logo: string | null
        metadata: string | null
        settings: OrganizationSettings | null
        parentOrgId: string | null
        expiresAt: Date | null
      }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const row = toOrganizationInsertRow(org)

          yield* sqlClient.query((db) =>
            db
              .insert(organizations)
              .values(row)
              .onConflictDoUpdate({
                target: organizations.id,
                set: {
                  name: row.name,
                  slug: row.slug,
                  logo: row.logo,
                  metadata: row.metadata,
                  settings: row.settings,
                  parentOrgId: row.parentOrgId,
                  expiresAt: row.expiresAt,
                  updatedAt: new Date(),
                },
              }),
          )
        }),

      delete: (id: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) => db.delete(organizations).where(eq(organizations.id, id)))
        }),

      deleteIfExpiredUnclaimed: (id: OrganizationIdType) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) =>
              db
                .delete(organizations)
                .where(and(eq(organizations.id, id), isNotNull(organizations.expiresAt)))
                .returning({ id: organizations.id }),
            )
            .pipe(Effect.map((rows) => rows.length > 0))
        }),

      countBySlug: (slug: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) =>
              db.select({ count: sql<number>`count(*)::int` }).from(organizations).where(eq(organizations.slug, slug)),
            )
            .pipe(Effect.map((results) => results[0]?.count ?? 0))
        }),

      // Cross-org (cleanup reaper) — no org filter; must run on the admin client.
      listExpiredUnclaimed: (cutoff: Date) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) =>
              db
                .select()
                .from(organizations)
                .where(and(isNotNull(organizations.expiresAt), lt(organizations.expiresAt, cutoff))),
            )
            .pipe(Effect.map((rows) => rows.map(toDomainOrganization)))
        }),
    }
  }),
)
