import type { NotificationGroup, RepositoryError, SlackIntegrationId, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { SlackIntegration } from "../entities/slack-integration.ts"
import type { SlackRoute } from "../entities/slack-route.ts"
import type { SlackIntegrationConflictError } from "../errors.ts"

export interface SlackIntegrationRepositoryShape {
  /**
   * Returns the live install (the row where `revoked_at IS NULL`) for
   * the current RLS-scoped organization, or `null` when none exists.
   */
  findActiveByOrganizationId(): Effect.Effect<SlackIntegration | null, RepositoryError, SqlClient>

  /**
   * Inserts an integration row. The `(team_id) WHERE revoked_at IS NULL`
   * partial unique index produces a {@link SlackIntegrationConflictError}
   * if another organization already owns the workspace. Same-org
   * re-installs should soft-revoke the existing row first; this method
   * does not perform that cleanup.
   *
   * The repository writes `organization_id` from the RLS context — the
   * value carried on the entity is informational at this layer.
   */
  save(
    integration: SlackIntegration,
  ): Effect.Effect<SlackIntegration, RepositoryError | SlackIntegrationConflictError, SqlClient>

  /**
   * Stamps `revoked_at` on a row guarded by `revoked_at IS NULL` so
   * concurrent revocations are idempotent. Returns `true` when this
   * caller won the claim, `false` when the row was already revoked or
   * does not exist in the current RLS-scoped organization.
   */
  softRevokeById(id: SlackIntegrationId, revokedAt: Date): Effect.Effect<boolean, RepositoryError, SqlClient>

  /**
   * Replaces the route list for one notification group on the active
   * details row. Passing `[]` clears the group. Inactive (soft-revoked)
   * rows are unaffected — only the row whose `(organization_id, kind)`
   * partial unique slot is currently held gets its `routes.<group>`
   * overwritten. Returns `true` when a row was actually updated.
   */
  updateRoutes(
    integrationId: SlackIntegrationId,
    group: NotificationGroup,
    routes: readonly SlackRoute[],
  ): Effect.Effect<boolean, RepositoryError, SqlClient>

  /**
   * Persists a freshly rotated token triple on the active details row,
   * scoped to the current RLS organization. Re-encrypts both tokens at
   * the repository boundary (same AES-256-GCM scheme as `save`). All
   * three values are non-nullable here: a successful rotation always
   * yields a new access token, a new refresh token, and an expiry — the
   * nullable columns only model the rotation-disabled install case.
   * Returns `true` when a row was updated, `false` when no matching
   * active row exists in the current org. Used by `getOrRefreshBotToken`.
   */
  updateTokens(
    integrationId: SlackIntegrationId,
    tokens: {
      readonly botAccessToken: string
      readonly refreshToken: string
      readonly tokenExpiresAt: Date
    },
  ): Effect.Effect<boolean, RepositoryError, SqlClient>

  /**
   * Stamps `reconnect_required_at` on the active details row, scoped to
   * the current RLS organization. Called when a refresh fails with
   * `invalid_refresh_token` — the rotation chain is dead and the
   * workspace must be reconnected. Idempotent (overwrites the stamp).
   * Returns `true` when a row was updated. A successful {@link updateTokens}
   * clears the stamp back to `null`.
   */
  markReconnectRequired(id: SlackIntegrationId, at: Date): Effect.Effect<boolean, RepositoryError, SqlClient>
}

export class SlackIntegrationRepository extends Context.Service<
  SlackIntegrationRepository,
  SlackIntegrationRepositoryShape
>()("@domain/integrations/SlackIntegrationRepository") {}
