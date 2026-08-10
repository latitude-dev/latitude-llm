import type { RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { GithubAccountType, GithubRepositorySelection } from "../entities/github-integration.ts"
import { GithubIntegrationRepository } from "../ports/repositories.ts"

/**
 * A normalized installation lifecycle change, decoded by the worker from the
 * raw `installation` / `installation_repositories` webhook actions (5.2). The
 * worker owns the action-string mapping; the domain applies the effect.
 */
export type GithubInstallationChange =
  | { readonly kind: "revoked" }
  | { readonly kind: "suspended"; readonly suspendedAt: Date }
  | { readonly kind: "unsuspended" }
  | {
      readonly kind: "metadata"
      readonly accountLogin: string
      readonly accountType: GithubAccountType
      readonly repositorySelection: GithubRepositorySelection
    }

export interface SyncGithubInstallationInput {
  readonly integrationId: string
  readonly change: GithubInstallationChange
}

/** Applies a normalized installation change to the RLS-scoped org's integration. Returns whether a row changed. */
export const syncGithubInstallationUseCase = (
  input: SyncGithubInstallationInput,
): Effect.Effect<boolean, RepositoryError, SqlClient | GithubIntegrationRepository> =>
  Effect.gen(function* () {
    const repo = yield* GithubIntegrationRepository
    const { change } = input

    switch (change.kind) {
      case "revoked":
        return yield* repo.softRevokeById(input.integrationId, new Date())
      case "suspended":
        return yield* repo.setSuspendedById(input.integrationId, change.suspendedAt)
      case "unsuspended":
        return yield* repo.setSuspendedById(input.integrationId, null)
      case "metadata":
        return yield* repo.updateMetadataById({
          id: input.integrationId,
          accountLogin: change.accountLogin,
          accountType: change.accountType,
          repositorySelection: change.repositorySelection,
        })
    }
  }).pipe(Effect.withSpan("github.syncInstallation"))
