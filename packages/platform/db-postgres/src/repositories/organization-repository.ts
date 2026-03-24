import { OrganizationRepository } from "@domain/organizations"
import {
  NotFoundError,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  type OrganizationSettings,
  SqlClient,
  type SqlClientShape,
  UserId,
  type UserId as UserIdType,
} from "@domain/shared"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { member, organization } from "../schema/better-auth.ts"

const toDomainOrganization = (row: typeof organization.$inferSelect) => ({
  id: OrganizationId(row.id),
  name: row.name,
  slug: row.slug,
  logo: row.logo,
  metadata: row.metadata,
  creatorId: row.creatorId ? UserId(row.creatorId) : null,
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
  creatorId: string | null
  settings: OrganizationSettings | null
}) => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  logo: org.logo,
  metadata: org.metadata,
  creatorId: org.creatorId,
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

    return {
      findById: (id: OrganizationIdType) =>
        sqlClient
          .query((db) => db.select().from(organization).where(eq(organization.id, id)).limit(1))
          .pipe(
            Effect.flatMap((results) => {
              const [result] = results
              if (!result) {
                return Effect.fail(new NotFoundError({ entity: "Organization", id }))
              }
              return Effect.succeed(toDomainOrganization(result))
            }),
          ),

      findByUserId: (userId: UserIdType) =>
        sqlClient
          .query((db) =>
            db
              .select({ organization })
              .from(organization)
              .innerJoin(member, eq(member.organizationId, organization.id))
              .where(eq(member.userId, userId)),
          )
          .pipe(Effect.map((results) => results.map(({ organization: org }) => toDomainOrganization(org)))),

      save: (org: {
        id: string
        name: string
        slug: string
        logo: string | null
        metadata: string | null
        creatorId: string | null
        settings: OrganizationSettings | null
      }) =>
        Effect.gen(function* () {
          const row = toOrganizationInsertRow(org)

          yield* sqlClient.query((db) =>
            db
              .insert(organization)
              .values(row)
              .onConflictDoUpdate({
                target: organization.id,
                set: {
                  name: row.name,
                  slug: row.slug,
                  logo: row.logo,
                  metadata: row.metadata,
                  creatorId: row.creatorId,
                  settings: row.settings,
                  updatedAt: new Date(),
                },
              }),
          )
        }),

      delete: (id: OrganizationIdType) =>
        sqlClient.query((db) => db.delete(organization).where(eq(organization.id, id))),

      existsBySlug: (slug: string) =>
        sqlClient
          .query((db) =>
            db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug)).limit(1),
          )
          .pipe(Effect.map((results) => results.length > 0)),
    }
  }),
)
