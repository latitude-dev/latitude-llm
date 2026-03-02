import type { Membership, MembershipRepository, MembershipRole } from "@domain/organizations";
import type { OrganizationId, UserId } from "@domain/shared-kernel";
import { toRepositoryError } from "@domain/shared-kernel";
import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import type { PostgresDb } from "../client.ts";
import * as schema from "../schema/index.ts";

/**
 * Maps a database member row to a domain Membership entity.
 */
const toDomainMembership = (memberRow: typeof schema.member.$inferSelect): Membership => ({
  id: memberRow.id,
  organizationId: memberRow.organizationId as OrganizationId,
  userId: memberRow.userId as UserId,
  role: memberRow.role as MembershipRole,
  invitedAt: null, // Better Auth doesn't store invitedAt separately
  confirmedAt: memberRow.createdAt, // Assume confirmed at creation for now
  createdAt: memberRow.createdAt,
});

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
          const member = await db.query.member.findFirst({
            where: eq(schema.member.id, id),
          });

          return member ? toDomainMembership(member) : null;
        },
        catch: (error) => toRepositoryError(error, "findById"),
      });

      return result;
    }),

  findByOrganizationId: (organizationId: OrganizationId) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: async () => {
          const members = await db.query.member.findMany({
            where: eq(schema.member.organizationId, organizationId as string),
          });

          return members.map(toDomainMembership);
        },
        catch: (error) => toRepositoryError(error, "findByOrganizationId"),
      });

      return results;
    }),

  findByUserId: (userId: string) =>
    Effect.gen(function* () {
      const results = yield* Effect.tryPromise({
        try: async () => {
          const members = await db.query.member.findMany({
            where: eq(schema.member.userId, userId),
          });

          return members.map(toDomainMembership);
        },
        catch: (error) => toRepositoryError(error, "findByUserId"),
      });

      return results;
    }),

  findByOrganizationAndUser: (organizationId: OrganizationId, userId: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const member = await db.query.member.findFirst({
            where: and(
              eq(schema.member.organizationId, organizationId as string),
              eq(schema.member.userId, userId),
            ),
          });

          return member ? toDomainMembership(member) : null;
        },
        catch: (error) => toRepositoryError(error, "findByOrganizationAndUser"),
      });

      return result;
    }),

  isMember: (organizationId: OrganizationId, userId: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const member = await db.query.member.findFirst({
            where: and(
              eq(schema.member.organizationId, organizationId as string),
              eq(schema.member.userId, userId),
            ),
          });

          return member !== null;
        },
        catch: (error) => toRepositoryError(error, "isMember"),
      });

      return result;
    }),

  isAdmin: (organizationId: OrganizationId, userId: string) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: async () => {
          // Check if member exists with admin or owner role
          const member = await db.query.member.findFirst({
            where: and(
              eq(schema.member.organizationId, organizationId as string),
              eq(schema.member.userId, userId),
            ),
          });

          if (!member) return false;

          return member.role === "admin" || member.role === "owner";
        },
        catch: (error) => toRepositoryError(error, "isAdmin"),
      });

      return result;
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
              organizationId: membership.organizationId as string,
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
      });
    }),

  delete: (id: string) =>
    Effect.tryPromise({
      try: () => db.delete(schema.member).where(eq(schema.member.id, id)),
      catch: (error) => toRepositoryError(error, "delete"),
    }),
});
