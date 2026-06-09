import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { emailDomain, type SsoProvider } from "../entities/sso-provider.ts"
import { SsoProviderRepository } from "../ports/sso-provider-repository.ts"

export interface ResolveSsoForEmailInput {
  readonly email: string
}

/**
 * Login-time lookup: does this email's domain belong to a **verified** SSO
 * provider? Returns the provider so the login page can redirect to
 * `signIn.sso`, or null to fall back to the magic-link flow.
 *
 * Runs unauthenticated — provide the repository through the admin client.
 */
export const resolveSsoForEmailUseCase = Effect.fn("sso.resolveSsoForEmail")(function* (
  input: ResolveSsoForEmailInput,
) {
  const domain = emailDomain(input.email)
  if (!domain) return null

  const repo = yield* SsoProviderRepository
  return yield* repo.findVerifiedByDomain(domain)
}) satisfies (
  input: ResolveSsoForEmailInput,
) => Effect.Effect<SsoProvider | null, RepositoryError, SsoProviderRepository | SqlClient>
