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
import {
  configureSlackRouteUseCase,
  removeSlackRouteUseCase,
  revokeSlackIntegrationUseCase,
  type SlackChannel,
  type SlackChannelLister,
  SlackChannelListerError,
  type SlackIntegration,
  SlackIntegrationRepository,
  type SlackRoute,
  type SlackRoutes,
} from "@domain/integrations"
import {
  NOTIFICATION_GROUPS,
  type NotificationGroup,
  type RepositoryError,
  type SlackIntegrationId,
  SlackIntegrationId as SlackIntegrationIdBrand,
  type SqlClient,
} from "@domain/shared"
import { SlackIntegrationRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
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
  /** Per-notification-group channel routing (Phase 3). */
  readonly routes: SlackRoutes
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
  routes: row.routes ?? {},
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

const notificationGroupValues = NOTIFICATION_GROUPS as readonly NotificationGroup[]

const configureSlackRouteSchema = z.object({
  group: z.enum(notificationGroupValues as [NotificationGroup, ...NotificationGroup[]]),
  routes: z
    .array(
      z.object({
        channelId: z.string().min(1),
        channelName: z.string().min(1),
      }),
    )
    .max(50),
})

const removeSlackRouteSchema = z.object({
  group: z.enum(notificationGroupValues as [NotificationGroup, ...NotificationGroup[]]),
})

/**
 * Lists the channels the bot can see in the connected workspace. Calls
 * Slack's `conversations.list` paginated; archived channels are filtered
 * out by `@platform/slack`. Private channels only appear if the bot is
 * already a member — the UI surfaces a hint to invite the bot.
 */
export const listSlackChannels = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly SlackChannel[]> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const integration = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        return yield* repo.findActiveByOrganizationId()
      }).pipe(withPostgres(SlackIntegrationRepositoryLive, client, organizationId), withTracing),
    )
    if (!integration) return []

    // Dynamic import keeps `@slack/web-api` off the client bundle (see
    // the disconnect path for the same dance).
    const { listAllConversations } = await import("@platform/slack")
    const channels = await Effect.runPromise(
      listAllConversations({ botToken: integration.botAccessToken }).pipe(
        Effect.map((all): readonly SlackChannel[] =>
          all
            .filter((c) => !c.isArchived)
            .map((c) => ({
              id: c.id,
              name: c.name,
              isPrivate: c.isPrivate,
              isMember: c.isMember,
              isArchived: c.isArchived,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
        Effect.catchTag("SlackAuthError", () => Effect.fail(new SlackChannelListerError({ reason: "auth" }))),
        Effect.catchTag("SlackChannelGoneError", () => Effect.succeed([] as readonly SlackChannel[])),
        Effect.catchTag("SlackRateLimitError", () =>
          Effect.fail(new SlackChannelListerError({ reason: "rate-limited" })),
        ),
        Effect.catchTag("SlackTransportError", (cause) =>
          Effect.fail(new SlackChannelListerError({ reason: "transport", cause })),
        ),
      ),
    )

    return channels
  },
)

/**
 * Replaces the route list for one notification group on the active
 * integration. Empty list clears the group. Returns the updated record
 * so callers can update query caches without a roundtrip.
 */
export const configureSlackRoute = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => configureSlackRouteSchema.parse(data))
  .handler(async ({ data }): Promise<SlackIntegrationRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        const integration = yield* repo.findActiveByOrganizationId()
        if (!integration) {
          return yield* Effect.die(new Error("Slack integration is not connected for this organization"))
        }
        yield* configureSlackRouteUseCase({
          integrationId: SlackIntegrationIdBrand(integration.id),
          group: data.group,
          routes: data.routes as readonly SlackRoute[],
        })
        const updated = yield* repo.findActiveByOrganizationId()
        if (!updated) {
          return yield* Effect.die(new Error("Slack integration disappeared mid-configure"))
        }
        return toRecord(updated)
      }).pipe(withPostgres(SlackIntegrationRepositoryLive, client, organizationId), withTracing),
    )
  })

/**
 * Clears every route configured for one group. Equivalent to
 * `configureSlackRoute({ group, routes: [] })`; exists as a separate
 * call so the UI can be explicit about "I'm turning this off" vs
 * "I'm replacing the list with nothing right now".
 */
export const removeSlackRoute = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => removeSlackRouteSchema.parse(data))
  .handler(async ({ data }): Promise<SlackIntegrationRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    return Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* SlackIntegrationRepository
        const integration = yield* repo.findActiveByOrganizationId()
        if (!integration) {
          return yield* Effect.die(new Error("Slack integration is not connected for this organization"))
        }
        yield* removeSlackRouteUseCase({
          integrationId: SlackIntegrationIdBrand(integration.id),
          group: data.group,
        })
        const updated = yield* repo.findActiveByOrganizationId()
        if (!updated) {
          return yield* Effect.die(new Error("Slack integration disappeared mid-remove"))
        }
        return toRecord(updated)
      }).pipe(withPostgres(SlackIntegrationRepositoryLive, client, organizationId), withTracing),
    )
  })

void ({} as SlackChannelLister) // Keep the SlackChannelLister type import alive for renderer-level code paths.
