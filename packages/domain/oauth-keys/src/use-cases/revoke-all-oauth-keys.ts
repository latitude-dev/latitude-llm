import { SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { OAuthKeyRepository } from "../ports/oauth-key-repository.ts"
import { revokeOAuthKeyUseCase } from "./revoke-oauth-key.ts"

/** Revokes every OAuth key of the organization bound on the `SqlClient`, disabling their applications. */
export const revokeAllOAuthKeysUseCase = Effect.fn("oauthKeys.revokeAllOAuthKeys")(function* () {
  const sqlClient = yield* SqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repository = yield* OAuthKeyRepository
      const oauthKeys = yield* repository.listForOrganization()

      for (const oauthKey of oauthKeys) {
        yield* revokeOAuthKeyUseCase({
          clientId: oauthKey.clientId,
          userId: oauthKey.userId,
          actor: { kind: "organization" },
        })
      }

      return oauthKeys
    }),
  )
})
