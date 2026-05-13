import { type OAuthKey, OAuthKeyRepository } from "@domain/oauth-keys"
import { RepositoryError, SqlClient, type SqlClientShape } from "@domain/shared"
import { and, desc, eq, max } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { oauthAccessTokens, oauthApplications, users } from "../schema/better-auth.ts"

const toDomain = (row: {
  readonly clientId: string | null
  readonly clientName: string | null
  readonly clientIcon: string | null
  readonly disabled: boolean | null
  readonly userId: string | null
  readonly userName: string | null
  readonly userEmail: string
  readonly lastActivityAt: Date | null
  readonly connectedAt: Date | null
}): OAuthKey => ({
  id: `${row.clientId ?? ""}:${row.userId ?? ""}`,
  clientId: row.clientId ?? "",
  clientName: row.clientName,
  clientIcon: row.clientIcon,
  userId: row.userId ?? "",
  userName: row.userName,
  userEmail: row.userEmail,
  lastActivityAt: row.lastActivityAt,
  connectedAt: row.connectedAt ?? new Date(0),
  disabled: row.disabled ?? false,
})

/**
 * Live implementation of {@link OAuthKeyRepository}. Every method resolves
 * `SqlClient` per call so the RLS context attached to the current request
 * applies — `oauth_applications` is RLS-scoped on `organization_id`, and the
 * JOINs through it transitively limit the unprotected child tables
 * (`oauth_access_tokens`, `users`) to rows visible under the active org.
 *
 * Per the platform convention, queries pull `organizationId` from the
 * RLS-bound `SqlClient` callback rather than taking it as a method input —
 * the explicit `WHERE oauth_applications.organization_id = ?` is
 * defence-in-depth on top of the RLS policy.
 */
export const OAuthKeyRepositoryLive = Layer.effect(
  OAuthKeyRepository,
  Effect.succeed({
    listForOrganization: () =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db, organizationId) =>
          db
            .select({
              clientId: oauthApplications.clientId,
              clientName: oauthApplications.name,
              clientIcon: oauthApplications.icon,
              disabled: oauthApplications.disabled,
              userId: oauthAccessTokens.userId,
              userName: users.name,
              userEmail: users.email,
              lastActivityAt: max(oauthAccessTokens.updatedAt),
              connectedAt: max(oauthAccessTokens.createdAt),
            })
            .from(oauthApplications)
            .innerJoin(oauthAccessTokens, eq(oauthAccessTokens.clientId, oauthApplications.clientId))
            .innerJoin(users, eq(users.id, oauthAccessTokens.userId))
            .where(eq(oauthApplications.organizationId, organizationId))
            .groupBy(
              oauthApplications.clientId,
              oauthApplications.name,
              oauthApplications.icon,
              oauthApplications.disabled,
              oauthAccessTokens.userId,
              users.name,
              users.email,
            )
            .orderBy(desc(max(oauthAccessTokens.createdAt))),
        )
        return rows.map(toDomain)
      }),

    applicationBelongsToOrganization: (clientId: string) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db, organizationId) =>
          db
            .select({ id: oauthApplications.id })
            .from(oauthApplications)
            .where(and(eq(oauthApplications.clientId, clientId), eq(oauthApplications.organizationId, organizationId)))
            .limit(1),
        )
        return rows.length > 0
      }),

    deleteTokensForPair: (input) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient
          .query((db) =>
            db
              .delete(oauthAccessTokens)
              .where(and(eq(oauthAccessTokens.clientId, input.clientId), eq(oauthAccessTokens.userId, input.userId)))
              .returning({ accessToken: oauthAccessTokens.accessToken }),
          )
          .pipe(
            Effect.mapError(
              (cause): RepositoryError => new RepositoryError({ operation: "deleteTokensForPair", cause }),
            ),
          )
        return rows.map((r) => r.accessToken).filter((t): t is string => t !== null)
      }),

    hasRemainingTokensForApplication: (clientId: string) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        const rows = yield* sqlClient.query((db) =>
          db
            .select({ id: oauthAccessTokens.id })
            .from(oauthAccessTokens)
            .where(eq(oauthAccessTokens.clientId, clientId))
            .limit(1),
        )
        return rows.length > 0
      }),

    markApplicationDisabled: (clientId: string) =>
      Effect.gen(function* () {
        const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
        yield* sqlClient
          .query((db, organizationId) =>
            db
              .update(oauthApplications)
              .set({ disabled: true, updatedAt: new Date() })
              .where(
                and(eq(oauthApplications.clientId, clientId), eq(oauthApplications.organizationId, organizationId)),
              ),
          )
          .pipe(
            Effect.mapError(
              (cause): RepositoryError => new RepositoryError({ operation: "markApplicationDisabled", cause }),
            ),
          )
      }),
  }),
)
