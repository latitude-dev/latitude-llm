import { type AdminUserDetails, type AdminUserMembership, AdminUserRepository } from "@domain/admin"
import { NotFoundError, SqlClient, type SqlClientShape, type UserId } from "@domain/shared"
import { eq, inArray } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { members, organizations, users } from "../schema/better-auth.ts"

type UserRoleValue = AdminUserDetails["role"]
type MemberRoleValue = AdminUserMembership["role"]

/**
 * Live layer for the backoffice user-detail port.
 *
 * ⚠️ SECURITY: queries run **without** an `organization_id` filter and
 * therefore see every user and every membership row in the database. This
 * is only safe when the SqlClient was constructed with
 * `OrganizationId("system")` (the default on `getAdminPostgresClient()`) so
 * RLS is bypassed. Never provide this layer on the standard app-facing
 * Postgres client.
 */
export const AdminUserRepositoryLive = Layer.effect(
  AdminUserRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (userId: UserId) =>
        Effect.gen(function* () {
          const rows = yield* sqlClient.query((db) =>
            db
              .select({
                id: users.id,
                email: users.email,
                name: users.name,
                image: users.image,
                role: users.role,
                createdAt: users.createdAt,
              })
              .from(users)
              .where(eq(users.id, userId))
              .limit(1),
          )
          const row = rows[0]
          if (!row) {
            return yield* Effect.fail(new NotFoundError({ entity: "User", id: userId }))
          }

          const membershipRows = yield* sqlClient.query((db) =>
            db
              .select({
                organizationId: organizations.id,
                organizationName: organizations.name,
                organizationSlug: organizations.slug,
                role: members.role,
              })
              .from(members)
              .innerJoin(organizations, eq(members.organizationId, organizations.id))
              .where(inArray(members.userId, [row.id]))
              .orderBy(organizations.name),
          )

          const details: AdminUserDetails = {
            id: row.id,
            email: row.email,
            name: row.name ?? null,
            image: row.image ?? null,
            role: row.role as UserRoleValue,
            memberships: membershipRows.map((m) => ({
              organizationId: m.organizationId,
              organizationName: m.organizationName,
              organizationSlug: m.organizationSlug,
              role: m.role as MemberRoleValue,
            })),
            createdAt: row.createdAt,
          }
          return details
        }),
    }
  }),
)
