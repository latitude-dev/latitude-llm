import { type OAuthGrantInput, OAuthGrantRepository } from "@domain/oauth-keys"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { oauthAccessTokens, oauthApplications, oauthConsents } from "../schema/better-auth.ts"

export const OAuthGrantRepositoryLive = Layer.effect(
  OAuthGrantRepository,
  Effect.gen(function* () {
    return {
      createGrant: (input: OAuthGrantInput) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

          // A grant is one unit. An application without its token is invisible and unusable (the
          // Keys UI only lists pairs that have a token), and a token without its application fails
          // validation. `SqlClient.transaction` is re-entrant, so this costs nothing when the
          // caller already opened one — as partner provisioning does — and the three inserts stay
          // atomic even when someone calls this method on its own.
          yield* sqlClient.transaction(
            Effect.gen(function* () {
              yield* sqlClient.query((db, organizationId) =>
                db.insert(oauthApplications).values({
                  id: input.application.id,
                  name: input.application.name,
                  icon: input.application.icon,
                  metadata: input.application.metadata,
                  clientId: input.application.clientId,
                  clientSecret: input.application.clientSecret,
                  // Never NULL: BA's refresh grant does `res.redirectUrls.split(",")`
                  // unconditionally (`mcp/index.mjs:319`), so a NULL here 500s every refresh.
                  redirectUrls: input.application.redirectUrls,
                  type: input.application.type,
                  disabled: false,
                  userId: input.application.userId,
                  organizationId,
                }),
              )

              yield* sqlClient.query((db) =>
                db.insert(oauthAccessTokens).values({
                  id: input.token.id,
                  accessToken: input.token.accessToken,
                  refreshToken: input.token.refreshToken,
                  accessTokenExpiresAt: input.token.accessTokenExpiresAt,
                  refreshTokenExpiresAt: input.token.refreshTokenExpiresAt,
                  clientId: input.token.clientId,
                  userId: input.token.userId,
                  scopes: input.token.scopes,
                }),
              )

              yield* sqlClient.query((db) =>
                db.insert(oauthConsents).values({
                  id: input.consent.id,
                  clientId: input.consent.clientId,
                  userId: input.consent.userId,
                  scopes: input.consent.scopes,
                  consentGiven: true,
                }),
              )
            }),
          )
        }),
    }
  }),
)
