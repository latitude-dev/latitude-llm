import type { Organization, OrganizationRepository } from "@domain/organizations"
import {
  NotFoundError,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  SubscriptionId,
  UserId,
  type UserId as UserIdType,
  toRepositoryError,
} from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import * as schema from "../schema/index.ts"

/**
 * Maps a database organization row to a domain Organization entity.
 */
const toDomainOrganization = (row: typeof schema.organization.$inferSelect): Organization => ({
  id: OrganizationId(row.id),
  name: row.name,
  slug: row.slug,
  logo: row.logo,
  metadata: row.metadata,
  creatorId: row.creatorId ? UserId(row.creatorId) : null,
  currentSubscriptionId: row.currentSubscriptionId ? SubscriptionId(row.currentSubscriptionId) : null,
  stripeCustomerId: row.stripeCustomerId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Maps a domain Organization entity to a database insert row.
 */
const toInsertRow = (org: Organization): typeof schema.organization.$inferInsert => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  logo: org.logo,
  metadata: org.metadata,
  creatorId: org.creatorId,
  currentSubscriptionId: org.currentSubscriptionId,
  stripeCustomerId: org.stripeCustomerId,
  // createdAt and updatedAt are set by defaultNow()
})

/**
 * Creates a Postgres implementation of the OrganizationRepository port.
 */
export const createOrganizationPostgresRepository = (db: PostgresDb): OrganizationRepository => ({
  findById: (id: OrganizationIdType) =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () => db.select().from(schema.organization).where(eq(schema.organization.id, id)).limit(1),
        catch: (error) => toRepositoryError(error, "findById"),
      })

      if (!result) {
        return yield* new NotFoundError({ entity: "Organization", id })
      }

      return toDomainOrganization(result)
    }),

  findByUserId: (userId: UserIdType) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: async () => {
          return db
            .select({ organization: schema.organization })
            .from(schema.organization)
            .innerJoin(schema.member, eq(schema.member.organizationId, schema.organization.id))
            .where(eq(schema.member.userId, userId))
        },
        catch: (error) => toRepositoryError(error, "findByUserId"),
      })

      return results.map(({ organization }) => toDomainOrganization(organization))
    }),

  save: (organization: Organization) =>
    Effect.gen(function* () {
      const row = toInsertRow(organization)

      yield* Effect.tryPromise({
        try: () =>
          db
            .insert(schema.organization)
            .values(row)
            .onConflictDoUpdate({
              target: schema.organization.id,
              set: {
                name: row.name,
                slug: row.slug,
                logo: row.logo,
                metadata: row.metadata,
                creatorId: row.creatorId,
                currentSubscriptionId: row.currentSubscriptionId,
                stripeCustomerId: row.stripeCustomerId,
                updatedAt: new Date(),
              },
            }),
        catch: (error) => toRepositoryError(error, "save"),
      })
    }),

  delete: (id: OrganizationIdType) =>
    Effect.tryPromise({
      try: () => db.delete(schema.organization).where(eq(schema.organization.id, id)),
      catch: (error) => toRepositoryError(error, "delete"),
    }),

  existsBySlug: (slug: string) =>
    Effect.gen(function* () {
      const [result] = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ id: schema.organization.id })
            .from(schema.organization)
            .where(eq(schema.organization.slug, slug))
            .limit(1),
        catch: (error) => toRepositoryError(error, "existsBySlug"),
      })

      return result !== undefined
    }),
})
