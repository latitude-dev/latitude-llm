import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { GithubIntegrationRepository } from "../ports/repositories.ts"

export interface DisconnectGithubIntegrationInput {
  readonly id: string
}

/**
 * Soft-revokes the integration row. Config rows and references are kept for history
 * (D8) — only the parent's `revoked_at` is stamped, which pauses processing.
 * Returns whether this call won the revocation claim.
 */
export const disconnectGithubIntegrationUseCase = (
  input: DisconnectGithubIntegrationInput,
): Effect.Effect<boolean, RepositoryError, SqlClient | GithubIntegrationRepository> =>
  Effect.gen(function* () {
    const repo = yield* GithubIntegrationRepository
    return yield* repo.softRevokeById(input.id, new Date())
  }).pipe(Effect.withSpan("github.disconnectIntegration"))
