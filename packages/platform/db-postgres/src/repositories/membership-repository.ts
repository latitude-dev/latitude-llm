import { MembershipRepository, type MemberWithUser } from "@domain/organizations"
import { MembershipId, NotFoundError, OrganizationId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { type MemberRole, members, users } from "../schema/better-auth.ts"

const toDomainMembership = (memberRow: typeof members.$inferSelect) => ({
  id: MembershipId(memberRow.id),
  organizationId: OrganizationId(memberRow.organizationId),
  userId: UserId(memberRow.userId),
  role: memberRow.role,
  createdAt: memberRow.createdAt,
})

/**
 * Live layer that pulls db from SqlClient
 */
export const MembershipRepositoryLive = Layer.effect(
  MembershipRepository,
  Effect.gen(function* () {
    const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

    return {
      findById: (id: string) =>
        sqlClient
          .query((db) => db.select().from(members).where(eq(members.id, id)).limit(1))
          .pipe(
            Effect.flatMap((results) => {
              const [result] = results
              if (!result) {
                return Effect.fail(new NotFoundError({ entity: "Membership", id }))
              }
              return Effect.succeed(toDomainMembership(result))
            }),
          ),

      findByOrganizationId: (organizationId: OrganizationId) =>
        sqlClient
          .query((db) => db.select().from(members).where(eq(members.organizationId, organizationId)))
          .pipe(Effect.map((members) => members.map(toDomainMembership))),

      findByUserId: (userId: string) =>
        sqlClient
          .query((db) => db.select().from(members).where(eq(members.userId, userId)))
          .pipe(Effect.map((members) => members.map(toDomainMembership))),

      findByOrganizationAndUser: (organizationId: OrganizationId, userId: string) =>
        sqlClient
          .query((db) =>
            db
              .select()
              .from(members)
              .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
              .limit(1),
          )
          .pipe(
            Effect.flatMap((results) => {
              const [result] = results
              if (!result) {
                return Effect.fail(new NotFoundError({ entity: "Membership", id: `${organizationId}:${userId}` }))
              }
              return Effect.succeed(toDomainMembership(result))
            }),
          ),

      findMembersWithUser: (organizationId: OrganizationId) =>
        sqlClient
          .query((db) =>
            db
              .select({
                id: members.id,
                organizationId: members.organizationId,
                userId: members.userId,
                role: members.role,
                createdAt: members.createdAt,
                name: users.name,
                email: users.email,
              })
              .from(members)
              .innerJoin(users, eq(members.userId, users.id))
              .where(eq(members.organizationId, organizationId)),
          )
          .pipe(Effect.map((rows) => rows as MemberWithUser[])),

      isMember: (organizationId: OrganizationId, userId: string) =>
        sqlClient
          .query((db) =>
            db
              .select({ id: members.id })
              .from(members)
              .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
              .limit(1),
          )
          .pipe(Effect.map((results) => results.length > 0)),

      isAdmin: (organizationId: OrganizationId, userId: string) =>
        sqlClient
          .query((db) =>
            db
              .select({ role: members.role })
              .from(members)
              .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
              .limit(1),
          )
          .pipe(
            Effect.map((results) => {
              const [m] = results
              if (!m) return false
              return m.role === "admin" || m.role === "owner"
            }),
          ),

      save: (membership: { id: string; organizationId: string; userId: string; role: MemberRole }) =>
        sqlClient.query((db) =>
          db
            .insert(members)
            .values({
              id: membership.id,
              organizationId: membership.organizationId,
              userId: membership.userId,
              role: membership.role,
            })
            .onConflictDoUpdate({
              target: members.id,
              set: {
                role: membership.role,
              },
            }),
        ),

      delete: (id: string) => sqlClient.query((db) => db.delete(members).where(eq(members.id, id))),
    }
  }),
)
