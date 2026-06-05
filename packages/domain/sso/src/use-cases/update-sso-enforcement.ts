import { type RepositoryError, type SqlClient, ValidationError } from "@domain/shared"
import { Effect } from "effect"
import { SsoProviderRepository } from "../ports/sso-provider-repository.ts"

export interface UpdateSsoEnforcementInput {
  readonly enforced: boolean
}

/**
 * Toggle SSO enforcement for the active organization's provider.
 *
 * Invariant: enforcement can only be turned ON for a **verified** domain —
 * otherwise an unverified (potentially squatted) domain claim could lock an
 * email domain out of magic-link/social sign-in.
 */
export const updateSsoEnforcementUseCase = Effect.fn("sso.updateSsoEnforcement")(function* (
  input: UpdateSsoEnforcementInput,
) {
  const repo = yield* SsoProviderRepository
  const provider = yield* repo.findForOrganization()

  if (!provider) {
    return yield* new ValidationError({
      field: "enforced",
      message: "No SSO provider is configured for this organization",
    })
  }
  if (input.enforced && !provider.domainVerified) {
    return yield* new ValidationError({ field: "enforced", message: "Verify the domain before enforcing SSO" })
  }

  yield* repo.setEnforced(input.enforced)
}) satisfies (
  input: UpdateSsoEnforcementInput,
) => Effect.Effect<void, RepositoryError | ValidationError, SsoProviderRepository | SqlClient>
