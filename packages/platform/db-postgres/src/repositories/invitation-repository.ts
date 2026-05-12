import {
  type Invitation,
  InvitationRepository,
  type InvitationStatus,
  membershipRoleSchema,
} from "@domain/organizations"
import {
  InvitationId,
  NotFoundError,
  OrganizationId,
  type RepositoryError,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
  UserId,
} from "@domain/shared"
import { and, desc, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { invitations, organizations, users } from "../schema/better-auth.ts"

const toDomainInvitation = (row: typeof invitations.$inferSelect): Invitation => ({
  id: InvitationId(row.id),
  organizationId: OrganizationId(row.organizationId),
  email: row.email,
  // The DB column is nullable text; if BA or another writer ever stores `null`,
  // we surface it as `null` rather than fabricating "member".
  role: row.role === null ? null : (membershipRoleSchema.parse(row.role) as Invitation["role"]),
  status: row.status as InvitationStatus,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  inviterId: UserId(row.inviterId),
})

export const InvitationRepositoryLive = Layer.effect(
  InvitationRepository,
  Effect.gen(function* () {
    return {
      // Public lookup for invitation acceptance page - cross-org by design since the invitee
      // hasn't authenticated yet and needs to preview invitation details before accepting.
      findPublicPendingPreviewById: (invitationId: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const now = new Date()
          return yield* sqlClient
            .query((db) =>
              db
                .select({
                  email: invitations.email,
                  organizationName: organizations.name,
                  expiresAt: invitations.expiresAt,
                  inviterName: users.name,
                })
                .from(invitations)
                .innerJoin(organizations, eq(invitations.organizationId, organizations.id))
                .innerJoin(users, eq(invitations.inviterId, users.id))
                .where(and(eq(invitations.id, invitationId), eq(invitations.status, "pending")))
                .limit(1),
            )
            .pipe(
              Effect.flatMap((results) => {
                const [row] = results
                if (!row || row.expiresAt < now) {
                  return Effect.fail(new NotFoundError({ entity: "Invitation", id: invitationId }))
                }
                return Effect.succeed({
                  inviteeEmail: row.email.trim().toLowerCase(),
                  organizationName: row.organizationName,
                  inviterName: row.inviterName,
                })
              }),
            )
        }),

      listPending: () =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(invitations)
                .where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, "pending")))
                .orderBy(desc(invitations.createdAt)),
            )
            .pipe(Effect.map((rows) => rows.map(toDomainInvitation)))
        }),

      findById: (id) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          return yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(invitations)
                .where(and(eq(invitations.organizationId, organizationId), eq(invitations.id, id)))
                .limit(1),
            )
            .pipe(
              Effect.flatMap((results) => {
                const [row] = results
                if (!row) return Effect.fail(new NotFoundError({ entity: "Invitation", id }))
                return Effect.succeed(toDomainInvitation(row))
              }),
            )
        }),

      create: (invitation: Invitation) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db.insert(invitations).values({
                id: invitation.id,
                organizationId,
                email: invitation.email,
                role: invitation.role,
                status: invitation.status,
                expiresAt: invitation.expiresAt,
                createdAt: invitation.createdAt,
                inviterId: invitation.inviterId,
              }),
            )
            .pipe(Effect.mapError((cause): RepositoryError => toRepositoryError(cause, "insert invitation")))
        }),

      setStatus: (id, status) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(invitations)
                .set({ status })
                .where(and(eq(invitations.organizationId, organizationId), eq(invitations.id, id))),
            )
            .pipe(Effect.mapError((cause): RepositoryError => toRepositoryError(cause, "update invitation status")))
        }),
    }
  }),
)
