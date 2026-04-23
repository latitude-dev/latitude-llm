import { MembershipRepository } from "@domain/organizations"
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
    yield* SqlClient

    const listByOrganizationId = (organizationId: OrganizationId) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        return yield* sqlClient
          .query((db) => db.select().from(members).where(eq(members.organizationId, organizationId)))
          .pipe(Effect.map((rows) => rows.map(toDomainMembership)))
      })

    const listByUserId = (userId: string) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        return yield* sqlClient
          .query((db) => db.select().from(members).where(eq(members.userId, userId)))
          .pipe(Effect.map((rows) => rows.map(toDomainMembership)))
      })

    const listMembersWithUser = (organizationId: OrganizationId) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        return yield* sqlClient
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
                image: users.image,
              })
              .from(members)
              .innerJoin(users, eq(members.userId, users.id))
              .where(eq(members.organizationId, organizationId)),
          )
          .pipe(
            Effect.map((rows) =>
              rows.map((row) => ({
                ...row,
                id: MembershipId(row.id),
                organizationId: OrganizationId(row.organizationId),
                userId: UserId(row.userId),
              })),
            ),
          )
      })

    return {
      findById: (id: MembershipId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(members)
                .where(and(eq(members.organizationId, organizationId), eq(members.id, id)))
                .limit(1),
            )
            .pipe(
              Effect.flatMap((results) => {
                const [result] = results
                if (!result) {
                  return Effect.fail(new NotFoundError({ entity: "Membership", id }))
                }
                return Effect.succeed(toDomainMembership(result))
              }),
            )
        }),

      listByOrganizationId,

      listByUserId,

      findByOrganizationAndUser: (organizationId: OrganizationId, userId: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
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
            )
        }),

      listMembersWithUser,

      isMember: (organizationId: OrganizationId, userId: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db) =>
              db
                .select({ id: members.id })
                .from(members)
                .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
                .limit(1),
            )
            .pipe(Effect.map((results) => results.length > 0))
        }),

      isAdmin: (organizationId: OrganizationId, userId: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
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
            )
        }),

      save: (membership: { id: MembershipId; organizationId: OrganizationId; userId: UserId; role: MemberRole }) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db) =>
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
          )
        }),

      delete: (id: MembershipId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient.query((db, organizationId) =>
            db.delete(members).where(and(eq(members.organizationId, organizationId), eq(members.id, id))),
          )
        }),
    }
  }),
)
