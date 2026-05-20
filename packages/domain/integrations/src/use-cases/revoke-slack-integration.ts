import type { RepositoryError, SlackIntegrationId, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SlackIntegrationRepository } from "../ports/slack-integration-repository.ts"

export interface RevokeSlackIntegrationInput {
  readonly id: SlackIntegrationId
}

/**
 * Soft-revokes the integration row. Returns `true` when this call won
 * the revocation claim (the row was active and is now revoked), `false`
 * when the row was already revoked or does not exist.
 *
 * Phase 1 stops at the database side-effect. A best-effort `auth.revoke`
 * call against Slack belongs alongside the Phase 2 web disconnect flow.
 */
export const revokeSlackIntegrationUseCase = (
  input: RevokeSlackIntegrationInput,
): Effect.Effect<boolean, RepositoryError, SqlClient | SlackIntegrationRepository> =>
  Effect.gen(function* () {
    const repo = yield* SlackIntegrationRepository
    return yield* repo.softRevokeById(input.id, new Date())
  })
