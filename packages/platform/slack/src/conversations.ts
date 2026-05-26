import { Effect } from "effect"
import { createSlackClient } from "./client.ts"
import { SlackAuthError, SlackChannelGoneError, SlackRateLimitError, SlackTransportError } from "./errors.ts"

export interface SlackChannelSummary {
  readonly id: string
  readonly name: string
  readonly isPrivate: boolean
  readonly isMember: boolean
  readonly isArchived: boolean
}

const PAGE_LIMIT = 200

/**
 * Returns every channel the bot can see, draining all pages. Public
 * channels are listed regardless of membership; private channels only
 * appear when the bot is already a member (Slack's behaviour with the
 * `groups:read` scope alone). Archived channels are filtered out at
 * the API layer when possible — Slack respects `exclude_archived: true`
 * but we double-check at the boundary.
 */
export const listAllConversations = (input: {
  readonly botToken: string
}): Effect.Effect<
  readonly SlackChannelSummary[],
  SlackAuthError | SlackChannelGoneError | SlackRateLimitError | SlackTransportError,
  never
> =>
  Effect.gen(function* () {
    const client = createSlackClient(input.botToken)
    const out: SlackChannelSummary[] = []
    let cursor: string | undefined

    do {
      const page = yield* Effect.tryPromise({
        try: () =>
          client.conversations.list({
            types: "public_channel,private_channel",
            exclude_archived: true,
            limit: PAGE_LIMIT,
            ...(cursor ? { cursor } : {}),
          }),
        catch: (cause) => mapSlackError(cause, "conversations.list"),
      })

      for (const c of page.channels ?? []) {
        if (typeof c.id !== "string" || typeof c.name !== "string") continue
        if (c.is_archived === true) continue // double-check: API param is best-effort
        out.push({
          id: c.id,
          name: c.name,
          isPrivate: c.is_private ?? false,
          isMember: c.is_member ?? false,
          isArchived: c.is_archived ?? false,
        })
      }

      cursor = page.response_metadata?.next_cursor || undefined
    } while (cursor && cursor.length > 0)

    return out
  })

/**
 * Maps a raw Slack API failure to one of our tagged errors. Slack's
 * `WebClient` throws a `WebAPIPlatformError` carrying `data.error` and,
 * for 429s, `data.retryAfter` (seconds). Anything else is transport.
 */
export const mapSlackError = (
  cause: unknown,
  operation: string,
): SlackAuthError | SlackChannelGoneError | SlackRateLimitError | SlackTransportError => {
  const obj = (cause ?? {}) as { code?: string; data?: { error?: string; retryAfter?: number } }
  const slackError = obj.data?.error
  switch (slackError) {
    case "invalid_auth":
    case "token_revoked":
    case "token_expired":
    case "account_inactive":
      return new SlackAuthError({ reason: slackError })
    case "channel_not_found":
    case "not_in_channel":
    case "is_archived":
    case "channel_is_private":
      return new SlackChannelGoneError({ reason: slackError })
    case "ratelimited":
      return new SlackRateLimitError({ retryAfterSec: obj.data?.retryAfter ?? 30 })
    default:
      if (obj.code === "slack_webapi_rate_limited_error") {
        return new SlackRateLimitError({ retryAfterSec: obj.data?.retryAfter ?? 30 })
      }
      return new SlackTransportError({ operation, cause })
  }
}
