import { type MemberWithUser, MembershipRepository } from "@domain/organizations"
import { MembershipId, NotFoundError, OrganizationId, SqlClient, type SqlClientShape, UserId } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { type MemberRole, member, user } from "../schema/index.ts"

const toDomainMembership = (memberRow: typeof member.$inferSelect) => ({
  id: MembershipId(memberRow.id),
  organizationId: OrganizationId(memberRow.organizationId),
  userId: UserId(memberRow.userId),
  role: memberRow.role,
  invitedAt: null,
  confirmedAt: memberRow.createdAt,
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
          .query((db) => db.select().from(member).where(eq(member.id, id)).limit(1))
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
          .query((db) => db.select().from(member).where(eq(member.organizationId, organizationId)))
          .pipe(Effect.map((members) => members.map(toDomainMembership))),

      findByUserId: (userId: string) =>
        sqlClient
          .query((db) => db.select().from(member).where(eq(member.userId, userId)))
          .pipe(Effect.map((members) => members.map(toDomainMembership))),

      findByOrganizationAndUser: (organizationId: OrganizationId, userId: string) =>
        sqlClient
          .query((db) =>
            db
              .select()
              .from(member)
              .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
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
                id: member.id,
                organizationId: member.organizationId,
                userId: member.userId,
                role: member.role,
                createdAt: member.createdAt,
                name: user.name,
                email: user.email,
              })
              .from(member)
              .innerJoin(user, eq(member.userId, user.id))
              .where(eq(member.organizationId, organizationId)),
          )
          .pipe(Effect.map((rows) => rows as MemberWithUser[])),

      isMember: (organizationId: OrganizationId, userId: string) =>
        sqlClient
          .query((db) =>
            db
              .select({ id: member.id })
              .from(member)
              .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
              .limit(1),
          )
          .pipe(Effect.map((results) => results.length > 0)),

      isAdmin: (organizationId: OrganizationId, userId: string) =>
        sqlClient
          .query((db) =>
            db
              .select({ role: member.role })
              .from(member)
              .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
              .limit(1),
          )
          .pipe(
            Effect.map((results) => {
              const [m] = results
              if (!m) return false
              return m.role === "admin" || m.role === "owner"
            }),
          ),

      save: (membership: {
        id: string
        organizationId: string
        userId: string
        role: MemberRole
      }) =>
        sqlClient.query((db) =>
          db
            .insert(member)
            .values({
              id: membership.id,
              organizationId: membership.organizationId,
              userId: membership.userId,
              role: membership.role,
            })
            .onConflictDoUpdate({
              target: member.id,
              set: {
                role: membership.role,
              },
            }),
        ),

      delete: (id: string) => sqlClient.query((db) => db.delete(member).where(eq(member.id, id))),
    }
  }),
)
