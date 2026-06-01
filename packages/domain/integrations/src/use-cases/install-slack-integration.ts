import {
  type ConcurrentSqlTransactionError,
  generateId,
  type OrganizationId,
  type RepositoryError,
  SqlClient,
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { SlackIntegration } from "../entities/slack-integration.ts"
import type { SlackIntegrationConflictError } from "../errors.ts"
import { SlackIntegrationRepository } from "../ports/slack-integration-repository.ts"

export interface InstallSlackIntegrationInput {
  readonly organizationId: OrganizationId
  readonly teamId: string
  readonly teamName: string
  readonly appId: string
  readonly botUserId: string
  readonly botAccessToken: string
  readonly botTokenScopes: string
  readonly refreshToken: string | null
  readonly tokenExpiresAt: Date | null
  readonly installedByUserId: UserId
}

export type InstallSlackIntegrationError =
  | RepositoryError
  | SlackIntegrationConflictError
  | ConcurrentSqlTransactionError

/**
 * Installs (or re-installs) a Slack workspace for the current
 * organization. Same-org reinstall is supported: the existing active
 * integration is soft-revoked first so the partial unique
 * `(organization_id, kind) WHERE revoked_at IS NULL` index keeps
 * holding. Cross-organization conflicts (another org already owns the
 * workspace) surface as {@link SlackIntegrationConflictError} from the
 * repository's `save` via the `(kind, vendor_account_id)` partial
 * unique index.
 *
 * The use case opens a single `SqlClient.transaction` so the revoke +
 * the two-row insert (`integrations` parent + `slack_integration_details`)
 * are atomic.
 */
export const installSlackIntegrationUseCase = (
  input: InstallSlackIntegrationInput,
): Effect.Effect<SlackIntegration, InstallSlackIntegrationError, SqlClient | SlackIntegrationRepository> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository

        const existing = yield* repo.findActiveByOrganizationId()
        if (existing) {
          yield* repo.softRevokeById(existing.id, new Date())
        }

        const now = new Date()
        const integration: SlackIntegration = {
          id: generateId<"SlackIntegrationId">(),
          organizationId: input.organizationId,
          teamId: input.teamId,
          teamName: input.teamName,
          appId: input.appId,
          botUserId: input.botUserId,
          botAccessToken: input.botAccessToken,
          botTokenScopes: input.botTokenScopes,
          refreshToken: input.refreshToken,
          tokenExpiresAt: input.tokenExpiresAt,
          reconnectRequiredAt: null,
          installedByUserId: input.installedByUserId,
          installedAt: now,
          revokedAt: null,
          // Reinstall is a fresh-config reset. The previous details row
          // keeps its routes for audit but the new active row begins
          // empty — operators reconfigure channels after reconnecting.
          routes: {},
          createdAt: now,
          updatedAt: now,
        }

        return yield* repo.save(integration)
      }),
    )
  })
