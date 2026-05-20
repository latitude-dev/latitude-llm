import {
  generateId,
  type OrganizationId,
  type RepositoryError,
  type SqlClient,
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

export type InstallSlackIntegrationError = RepositoryError | SlackIntegrationConflictError

/**
 * Installs (or re-installs) a Slack workspace for the current
 * organization. If an active integration already exists in this org, it
 * is soft-revoked before the new row is inserted so the partial unique
 * `(team_id) WHERE revoked_at IS NULL` index keeps holding even when the
 * workspace is the same (which is the expected re-install path).
 *
 * Cross-organization conflicts surface as
 * {@link SlackIntegrationConflictError} from the repository's `save`.
 */
export const installSlackIntegrationUseCase = (
  input: InstallSlackIntegrationInput,
): Effect.Effect<SlackIntegration, InstallSlackIntegrationError, SqlClient | SlackIntegrationRepository> =>
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
      installedByUserId: input.installedByUserId,
      installedAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    return yield* repo.save(integration)
  })
