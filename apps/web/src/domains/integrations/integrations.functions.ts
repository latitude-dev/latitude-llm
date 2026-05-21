/**
 * Server-fns backing the **Integrations** settings page. Phase 2 is
 * Slack-only; future vendors (Telegram, Discord, GitHub Apps, …) plug
 * in here without changing the page shape.
 *
 * Read path goes through `SlackIntegrationRepository` so RLS on the
 * `integrations` parent + `slack_integration_details` tables enforces
 * org isolation. Disconnect soft-revokes locally first, then makes a
 * best-effort `auth.revoke` call on Slack — local revoke is the
 * source of truth, so a Slack-side network or auth blip does not
 * block the user.
 */
import { revokeSlackIntegrationUseCase, type SlackIntegration, SlackIntegrationRepository } from "@domain/integrations"
import type { RepositoryError, SlackIntegrationId, SqlClient } from "@domain/shared"
import { SlackIntegrationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

const logger = createLogger("slack-disconnect")

/**
 * Maximum time we wait for Slack's `auth.revoke` before giving up and
 * letting the local soft-revoke stand. Slack's API is usually fast
 * (~200ms) so 5s is generous for transient slowness without leaving
 * the user staring at a spinner.
 */
const SLACK_REVOKE_TIMEOUT_MS = 5_000

/**
 * Flat projection of {@link SlackIntegration} for the UI. Deliberately
 * omits the bot token, refresh token, token expiry, and (decrypted)
 * secrets — the settings page only needs identity + lifecycle info.
 */
export interface SlackIntegrationRecord {
  readonly id: string
  readonly teamId: string
  readonly teamName: string
  readonly appId: string
  readonly botUserId: string
  /** Comma-joined scope string from Slack, split into an array for display. */
  readonly botTokenScopes: readonly string[]
  readonly installedAt: string
  readonly installedByUserId: string
}

const toRecord = (row: SlackIntegration): SlackIntegrationRecord => ({
  id: row.id,
  teamId: row.teamId,
  teamName: row.teamName,
  appId: row.appId,
  botUserId: row.botUserId,
  botTokenScopes: row.botTokenScopes
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0),
  installedAt: row.installedAt.toISOString(),
  installedByUserId: row.installedByUserId,
})

export const getActiveSlackIntegration = createServerFn({ method: "GET" }).handler(
  async (): Promise<SlackIntegrationRecord | null> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const integration = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }).pipe(withPostgres(SlackIntegrationRepositoryLive, client, organizationId), withTracing),
    )

    return integration ? toRecord(integration) : null
  },
)

/**
 * Soft-revokes the active Slack integration for the current org and
 * issues a best-effort `auth.revoke` against Slack. Idempotent: if no
 * active integration exists, returns `{ revoked: false }`.
 *
 * Token plaintext (needed for the Slack-side revoke) only flows
 * through this server fn; it is **not** exposed over the wire — the
 * `SlackIntegrationRecord` projection in `getActiveSlackIntegration`
 * strips it.
 */
export const disconnectSlackIntegration = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ readonly revoked: boolean }> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    return Effect.runPromise(
      disconnectSlackIntegrationEffect.pipe(
        withPostgres(SlackIntegrationRepositoryLive, client, organizationId),
        withTracing,
      ),
    )
  },
)

/**
 * Exported as a separate Effect so tests can run it against an
 * in-memory repository without going through `createServerFn`.
 */
export const disconnectSlackIntegrationEffect: Effect.Effect<
  { readonly revoked: boolean },
  RepositoryError,
  SlackIntegrationRepository | SqlClient
> = Effect.gen(function* () {
  const repo = yield* SlackIntegrationRepository
  const active = yield* repo.findActiveByOrganizationId()
  if (active === null) return { revoked: false } as const

  yield* revokeSlackIntegrationUseCase({ id: active.id as SlackIntegrationId })

  // Best-effort Slack-side revoke. The try/catch lives inside the
  // promise body so any failure (network blip, 401, rate limit, etc.)
  // is logged and swallowed — the local soft-revoke stands as the
  // source of truth.
  //
  // `@platform/slack` is loaded via a dynamic import so this module
  // can be imported by the integrations page on the client without
  // pulling `@slack/web-api` (which has a top-level `require("node:path")`)
  // into the client bundle. The TanStack Start bundler can't statically
  // prove that `createSlackClient` is reachable only from server-side
  // handler bodies — keeping the import dynamic guarantees it.
  yield* Effect.promise(async () => {
    try {
      const { createSlackClient } = await import("@platform/slack")
      const slack = createSlackClient(active.botAccessToken, { timeoutMs: SLACK_REVOKE_TIMEOUT_MS })
      await slack.auth.revoke({ test: false })
    } catch (cause) {
      logger.warn("Slack auth.revoke failed; local soft-revoke stands", cause)
    }
  })

  return { revoked: true } as const
})
