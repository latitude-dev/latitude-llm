/**
 * Server-fns backing the **OAuth Keys** section on `/settings/keys`.
 *
 * An "OAuth key" here is a `(client_id, user_id)` pair — one row per
 * (MCP client, authorizing user) regardless of how many access tokens
 * the pair currently holds. The page lists them so the user can:
 *
 * - See which clients are connected to the organization, who connected
 *   them, and when they were last seen active.
 * - Revoke a key, which deletes every access token for that pair and
 *   disables the underlying `oauth_applications` row when the last
 *   token for that client is gone.
 *
 * Creation happens entirely through the OAuth consent flow
 * (`/auth/consent`) — there's no "Create OAuth key" surface here.
 */
import { OrganizationId, UnauthorizedError, UserId } from "@domain/shared"
import { and, desc, eq, max } from "@platform/db-postgres"
import { oauthAccessTokens, oauthApplications, users } from "@platform/db-postgres/schema/better-auth"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getAdminPostgresClient } from "../../server/clients.ts"

export interface OAuthKeyRecord {
  /** Stable key for the row — composite of client + user since neither alone is unique. */
  readonly id: string
  readonly clientId: string
  readonly clientName: string | null
  readonly clientIcon: string | null
  readonly userId: string
  readonly userName: string | null
  readonly userEmail: string
  /**
   * Most recent activity timestamp inferred from `oauth_access_tokens.updated_at`.
   * Tokens are issued, refreshed, and revoked through here, so this is a good
   * proxy for "last used" until we add a touch-buffer.
   */
  readonly lastActivityAt: string | null
  readonly createdAt: string
  readonly disabled: boolean
}

/**
 * Lists every active OAuth key in the caller's organization. Uses the admin
 * connection (RLS-bypass) plus an explicit `organizationId` filter — the
 * same pattern `oauth-consent.functions.ts` follows for OAuth-application
 * writes. `oauth_access_tokens` has no organization column, so the org
 * scope is enforced by the JOIN to `oauth_applications`.
 */
export const listOAuthKeys = createServerFn({ method: "GET" }).handler(async (): Promise<OAuthKeyRecord[]> => {
  const { organizationId } = await requireSession()
  const adminClient = getAdminPostgresClient()

  const rows = await adminClient.db
    .select({
      clientId: oauthApplications.clientId,
      clientName: oauthApplications.name,
      clientIcon: oauthApplications.icon,
      disabled: oauthApplications.disabled,
      userId: oauthAccessTokens.userId,
      userName: users.name,
      userEmail: users.email,
      lastActivityAt: max(oauthAccessTokens.updatedAt),
      firstSeenAt: max(oauthAccessTokens.createdAt),
    })
    .from(oauthApplications)
    .innerJoin(oauthAccessTokens, eq(oauthAccessTokens.clientId, oauthApplications.clientId))
    .innerJoin(users, eq(users.id, oauthAccessTokens.userId))
    .where(eq(oauthApplications.organizationId, OrganizationId(organizationId)))
    .groupBy(
      oauthApplications.clientId,
      oauthApplications.name,
      oauthApplications.icon,
      oauthApplications.disabled,
      oauthAccessTokens.userId,
      users.name,
      users.email,
    )
    .orderBy(desc(max(oauthAccessTokens.updatedAt)))

  return rows.map((row) => ({
    id: `${row.clientId}:${row.userId}`,
    clientId: row.clientId ?? "",
    clientName: row.clientName,
    clientIcon: row.clientIcon,
    userId: row.userId ?? "",
    userName: row.userName,
    userEmail: row.userEmail,
    lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
    createdAt: row.firstSeenAt ? row.firstSeenAt.toISOString() : new Date().toISOString(),
    disabled: row.disabled ?? false,
  }))
})

const revokeInputSchema = z.object({
  clientId: z.string().min(1),
  userId: z.string().min(1),
})

/**
 * Revokes one OAuth key. Steps, in order:
 *
 * 1. Verify the OAuth application belongs to the caller's organization.
 *    The admin connection bypasses RLS so we have to check explicitly.
 * 2. Delete every `oauth_access_tokens` row for the `(client_id, user_id)`
 *    pair. The next API request from that token returns 401.
 * 3. If no tokens remain for that `client_id` at all, mark the application
 *    `disabled = true` so it can't be silently re-used by another
 *    redirect_uri callback.
 *
 * Uses the admin connection: `oauth_access_tokens` has no organization
 * column (org-scoping is enforced by the JOIN to `oauth_applications`),
 * and a tenant-scoped DELETE on it would skip the RLS filter we rely on.
 */
export const revokeOAuthKey = createServerFn({ method: "POST" })
  .inputValidator(revokeInputSchema)
  .handler(async ({ data }): Promise<{ readonly success: true }> => {
    const { organizationId } = await requireSession()
    const adminClient = getAdminPostgresClient()

    const [application] = await adminClient.db
      .select({ id: oauthApplications.id, clientId: oauthApplications.clientId })
      .from(oauthApplications)
      .where(
        and(
          eq(oauthApplications.clientId, data.clientId),
          eq(oauthApplications.organizationId, OrganizationId(organizationId)),
        ),
      )
      .limit(1)
    if (!application) {
      throw new UnauthorizedError({ message: "OAuth application not found in this organization" })
    }

    await adminClient.db
      .delete(oauthAccessTokens)
      .where(and(eq(oauthAccessTokens.clientId, data.clientId), eq(oauthAccessTokens.userId, UserId(data.userId))))

    const [remaining] = await adminClient.db
      .select({ id: oauthAccessTokens.id })
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.clientId, data.clientId))
      .limit(1)

    if (!remaining) {
      await adminClient.db
        .update(oauthApplications)
        .set({ disabled: true, updatedAt: new Date() })
        .where(eq(oauthApplications.clientId, data.clientId))
    }

    return { success: true }
  })
