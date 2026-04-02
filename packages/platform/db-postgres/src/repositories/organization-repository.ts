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
import { eq } from "drizzle-orm"
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
}) => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  logo: org.logo,
  metadata: org.metadata,
  settings: org.settings,
})

/**
 * Live layer that pulls db from SqlClient
 * Organization table doesn't have organization_id field, so it doesn't need RLS
 */
export const OrganizationRepositoryLive = Layer.effect(
  OrganizationRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    const listByUserId = (userId: UserIdType) =>
      sqlClient
        .query((db) =>
          db
            .select({ organization: organizations })
            .from(organizations)
            .innerJoin(members, eq(members.organizationId, organizations.id))
            .where(eq(members.userId, userId)),
        )
        .pipe(Effect.map((results) => results.map(({ organization: org }) => toDomainOrganization(org))))

    return {
      findById: (id: OrganizationIdType) =>
        sqlClient
          .query((db) => db.select().from(organizations).where(eq(organizations.id, id)).limit(1))
          .pipe(
            Effect.flatMap((results) => {
              const [result] = results
              if (!result) {
                return Effect.fail(new NotFoundError({ entity: "Organization", id }))
              }
              return Effect.succeed(toDomainOrganization(result))
            }),
          ),

      listByUserId,
      findByUserId: listByUserId,

      save: (org: {
        id: string
        name: string
        slug: string
        logo: string | null
        metadata: string | null
        settings: OrganizationSettings | null
      }) =>
        Effect.gen(function* () {
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
                  updatedAt: new Date(),
                },
              }),
          )
        }),

      delete: (id: OrganizationIdType) =>
        sqlClient.query((db) => db.delete(organizations).where(eq(organizations.id, id))),

      existsBySlug: (slug: string) =>
        sqlClient
          .query((db) =>
            db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1),
          )
          .pipe(Effect.map((results) => results.length > 0)),
    }
  }),
)
