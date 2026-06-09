import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { SsoProviderRepository } from "../ports/sso-provider-repository.ts"
import { resolveSsoForEmailUseCase } from "./resolve-sso-for-email.ts"

export interface IsSsoEnforcedForEmailInput {
  readonly email: string
}

/**
 * Enforcement predicate shared by the magic-link server fn and the Better
 * Auth social sign-in hook: true only when the email's domain matches a
 * provider that is both **verified** and **enforced**.
 *
 * Enforcement is keyed by verified email domain, not org membership — the
 * check happens pre-auth where no org context exists, and a user can belong
 * to many orgs. Users with non-matching (e.g. personal) emails are never
 * blocked, even if they are members of an enforcing org.
 */
export const isSsoEnforcedForEmailUseCase = Effect.fn("sso.isSsoEnforcedForEmail")(function* (
  input: IsSsoEnforcedForEmailInput,
) {
  const provider = yield* resolveSsoForEmailUseCase({ email: input.email })
  return provider?.enforced ?? false
}) satisfies (
  input: IsSsoEnforcedForEmailInput,
) => Effect.Effect<boolean, RepositoryError, SsoProviderRepository | SqlClient>
