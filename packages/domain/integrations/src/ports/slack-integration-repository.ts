import type { RepositoryError, SlackIntegrationId, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { SlackIntegration } from "../entities/slack-integration.ts"
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
}

export class SlackIntegrationRepository extends Context.Service<
  SlackIntegrationRepository,
  SlackIntegrationRepositoryShape
>()("@domain/integrations/SlackIntegrationRepository") {}
