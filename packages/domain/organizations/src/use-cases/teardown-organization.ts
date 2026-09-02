import { revokeAllApiKeysUseCase } from "@domain/api-keys"
import { revokeAllOAuthKeysUseCase } from "@domain/oauth-keys"
import { purgeOrganizationProjectsUseCase } from "@domain/projects"
import { SqlClient } from "@domain/shared"
import { Effect } from "effect"

export interface TeardownOrganizationInput {
  /** Attributed as the actor on the `ProjectDeleted` events the purge emits. */
  readonly actorUserId: string
}

/**
 * Revokes every API key and OAuth key of the organization bound on the `SqlClient`
 * and purges its projects. Run it before deleting the organization row: OAuth
 * rows FK-cascade with the org and could no longer be listed for revocation,
 * while API keys and projects have no FK and would otherwise outlive it.
 */
export const teardownOrganizationUseCase = Effect.fn("organizations.teardownOrganization")(function* (
  input: TeardownOrganizationInput,
) {
  const sqlClient = yield* SqlClient
  yield* Effect.annotateCurrentSpan("organization.id", sqlClient.organizationId)

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      yield* revokeAllApiKeysUseCase()
      yield* revokeAllOAuthKeysUseCase()
      yield* purgeOrganizationProjectsUseCase({ actorUserId: input.actorUserId })
    }),
  )
})
