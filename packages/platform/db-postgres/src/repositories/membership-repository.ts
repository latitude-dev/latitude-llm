import type { Membership, MembershipRepository } from "@domain/organizations"
import { MembershipId, OrganizationId, type RepositoryError, UserId, toRepositoryError } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import type { PostgresDb } from "../client.ts"
import * as schema from "../schema/index.ts"

export interface MemberWithUser {
  readonly id: string
  readonly organizationId: string
  readonly userId: string
  readonly role: string
  readonly name: string | null
  readonly email: string
  readonly createdAt: Date
}

export const findMembersWithUser = (
  db: PostgresDb,
  organizationId: string,
): Effect.Effect<readonly MemberWithUser[], RepositoryError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .select({
          id: schema.member.id,
          organizationId: schema.member.organizationId,
          userId: schema.member.userId,
          role: schema.member.role,
          createdAt: schema.member.createdAt,
          name: schema.user.name,
          email: schema.user.email,
        })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
        .where(eq(schema.member.organizationId, organizationId))

      return rows
    },
    catch: (error) => toRepositoryError(error, "findMembersWithUser"),
  })

/**
 * Maps a database member row to a domain Membership entity.
 */
const toDomainMembership = (memberRow: typeof schema.member.$inferSelect): Membership => ({
  id: MembershipId(memberRow.id),
  organizationId: OrganizationId(memberRow.organizationId),
  userId: UserId(memberRow.userId),
  role: memberRow.role,
  invitedAt: null, // Better Auth doesn't store invitedAt separately
  confirmedAt: memberRow.createdAt, // Assume confirmed at creation for now
  createdAt: memberRow.createdAt,
})

/**
 * Creates a Postgres implementation of the MembershipRepository port.
 *
 * Queries Better Auth's member table directly using organizationId.
 * RLS policies enforce access control.
 */
export const createMembershipPostgresRepository = (db: PostgresDb): MembershipRepository => ({
  findById: (id: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const [member] = await db.select().from(schema.member).where(eq(schema.member.id, id)).limit(1)

          return member ? toDomainMembership(member) : null
        },
        catch: (error) => toRepositoryError(error, "findById"),
      })

      return result
    }),

  findByOrganizationId: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: async () => {
          const members = await db.select().from(schema.member).where(eq(schema.member.organizationId, organizationId))

          return members.map(toDomainMembership)
        },
        catch: (error) => toRepositoryError(error, "findByOrganizationId"),
      })

      return results
    }),

  findByUserId: (userId: string) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: async () => {
          const members = await db.select().from(schema.member).where(eq(schema.member.userId, userId))

          return members.map(toDomainMembership)
        },
        catch: (error) => toRepositoryError(error, "findByUserId"),
      })

      return results
    }),

  findByOrganizationAndUser: (organizationId: OrganizationId, userId: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const [member] = await db
            .select()
            .from(schema.member)
            .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)))
            .limit(1)

          return member ? toDomainMembership(member) : null
        },
        catch: (error) => toRepositoryError(error, "findByOrganizationAndUser"),
      })

      return result
    }),

  isMember: (organizationId: OrganizationId, userId: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const [member] = await db
            .select({ id: schema.member.id })
            .from(schema.member)
            .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)))
            .limit(1)

          return member !== undefined
        },
        catch: (error) => toRepositoryError(error, "isMember"),
      })

      return result
    }),

  isAdmin: (organizationId: OrganizationId, userId: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: async () => {
          // Check if member exists with admin or owner role
          const [member] = await db
            .select({ role: schema.member.role })
            .from(schema.member)
            .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)))
            .limit(1)

          if (!member) return false

          return member.role === "admin" || member.role === "owner"
        },
        catch: (error) => toRepositoryError(error, "isAdmin"),
      })

      return result
    }),

  save: (membership: Membership) =>
    Effect.gen(function* () {
      // Insert or update in Better Auth's member table
      // organizationId comes from the membership.organizationId field
      yield* Effect.tryPromise({
        try: () =>
          db
            .insert(schema.member)
            .values({
              id: membership.id,
              organizationId: membership.organizationId,
              userId: membership.userId,
              role: membership.role,
            })
            .onConflictDoUpdate({
              target: schema.member.id,
              set: {
                role: membership.role,
              },
            }),
        catch: (error) => toRepositoryError(error, "save"),
      })
    }),

  delete: (id: string) =>
    Effect.tryPromise({
      try: () => db.delete(schema.member).where(eq(schema.member.id, id)),
      catch: (error) => toRepositoryError(error, "delete"),
    }),
})
