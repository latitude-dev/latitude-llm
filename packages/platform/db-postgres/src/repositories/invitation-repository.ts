import { InvitationRepository } from "@domain/organizations"
import { NotFoundError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { invitations, organizations, users } from "../schema/better-auth.ts"

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
    }
  }),
)
