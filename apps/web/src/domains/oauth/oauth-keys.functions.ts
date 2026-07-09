/**
 * Server-fns backing the **OAuth Keys** section on `/settings/keys`. Thin
 * wrappers over the `@domain/oauth-keys` use-cases — the list / revoke
 * logic lives there, behind `OAuthKeyRepository` so the tenant Postgres
 * connection (and its RLS policy on `oauth_applications`) enforces the
 * org scope.
 *
 * Creation happens entirely through the OAuth consent flow
 * (`/auth/consent`) — there's no "Create OAuth key" surface here.
 */

import { listOAuthKeysUseCase, type OAuthKey, revokeOAuthKeyUseCase } from "@domain/oauth-keys"
import { MembershipRepository } from "@domain/organizations"
import { ForbiddenError } from "@domain/shared"
import { MembershipRepositoryLive, OAuthKeyRepositoryLive, withPostgres } from "@platform/db-postgres"
import { OAuthTokenCacheInvalidatorLive } from "@platform/oauth-token-auth"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getRedisClient } from "../../server/clients.ts"

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
   * `null` when the pair has never been refreshed past initial issuance.
   */
  readonly lastActivityAt: string | null
  /** ISO-8601 of the most recent token issuance for the pair (the "Connected" column). */
  readonly createdAt: string
  readonly disabled: boolean
}

const toRecord = (key: OAuthKey): OAuthKeyRecord => ({
  id: key.id,
  clientId: key.clientId,
  clientName: key.clientName,
  clientIcon: key.clientIcon,
  userId: key.userId,
  userName: key.userName,
  userEmail: key.userEmail,
  lastActivityAt: key.lastActivityAt ? key.lastActivityAt.toISOString() : null,
  createdAt: key.connectedAt.toISOString(),
  disabled: key.disabled,
})

const requireOAuthKeyAdmin = async () => {
  const session = await requireSession()
  const client = getPostgresClient()
  const isAdmin = await Effect.runPromise(
    Effect.gen(function* () {
      const memberships = yield* MembershipRepository
      return yield* memberships.isAdmin(session.organizationId, session.userId)
    }).pipe(withPostgres(MembershipRepositoryLive, client, session.organizationId), withTracing),
  )
  if (!isAdmin) {
    throw new ForbiddenError({ message: "Only organization owners and admins can manage OAuth keys" })
  }
  return { ...session, client }
}

export const listOAuthKeys = createServerFn({ method: "GET" }).handler(async (): Promise<OAuthKeyRecord[]> => {
  const { organizationId, client } = await requireOAuthKeyAdmin()

  const keys = await Effect.runPromise(
    listOAuthKeysUseCase().pipe(withPostgres(OAuthKeyRepositoryLive, client, organizationId), withTracing),
  )

  return keys.map(toRecord)
})

const revokeInputSchema = z.object({
  clientId: z.string().min(1),
  userId: z.string().min(1),
})

export const revokeOAuthKey = createServerFn({ method: "POST" })
  .inputValidator(revokeInputSchema)
  .handler(async ({ data }): Promise<{ readonly success: true }> => {
    const { organizationId, client } = await requireOAuthKeyAdmin()
    const redis = getRedisClient()

    await Effect.runPromise(
      revokeOAuthKeyUseCase({ clientId: data.clientId, userId: data.userId, actor: { kind: "organization" } }).pipe(
        Effect.provide(OAuthTokenCacheInvalidatorLive(redis)),
        withPostgres(OAuthKeyRepositoryLive, client, organizationId),
        withTracing,
      ),
    )

    return { success: true }
  })
