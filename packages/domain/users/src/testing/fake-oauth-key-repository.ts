import type { OAuthKeyRepository, VerificationValue } from "@domain/oauth-keys"
import { Effect } from "effect"

type OAuthKeyRepositoryShape = (typeof OAuthKeyRepository)["Service"]

export const createFakeOAuthKeyRepository = (overrides?: Partial<OAuthKeyRepositoryShape>) => {
  const verificationValues: VerificationValue[] = []

  const repository: OAuthKeyRepositoryShape = {
    listForOrganization: () => Effect.succeed([]),

    findByPair: () => Effect.succeed(null),

    applicationBelongsToOrganization: () => Effect.succeed(false),

    deleteTokensForPair: () => Effect.succeed([]),

    hasRemainingTokensForApplication: () => Effect.succeed(false),

    markApplicationDisabled: () => Effect.void,

    createVerificationValue: (verification) =>
      Effect.sync(() => {
        verificationValues.push(verification)
      }),

    ...overrides,
  }

  return { repository, verificationValues }
}
