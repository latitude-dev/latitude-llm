import type { KnownBlock } from "@slack/web-api"
import { Effect } from "effect"
import { createSlackClient } from "./client.ts"
import { mapSlackError } from "./conversations.ts"
import type {
  SlackAuthError,
  SlackChannelGoneError,
  SlackRateLimitError,
  SlackTransportError,
} from "./errors.ts"

/**
 * Posts a message to a Slack channel as the bot. `text` is required —
 * it powers the mobile-push preview, screen reader output, and the
 * fallback display when blocks fail to render. `blocks` carries the
 * rich layout. Returns the Slack message `ts` (used as the durable id
 * for later thread replies, edits, etc.).
 */
export const postMessage = (input: {
  readonly botToken: string
  readonly channelId: string
  readonly text: string
  readonly blocks: readonly KnownBlock[]
}): Effect.Effect<
  { readonly messageTs: string },
  SlackAuthError | SlackChannelGoneError | SlackRateLimitError | SlackTransportError,
  never
> =>
  Effect.gen(function* () {
    const client = createSlackClient(input.botToken)
    const response = yield* Effect.tryPromise({
      try: () =>
        client.chat.postMessage({
          channel: input.channelId,
          text: input.text,
          blocks: [...input.blocks],
        }),
      catch: (cause) => mapSlackError(cause, "chat.postMessage"),
    })

    if (typeof response.ts !== "string" || response.ts.length === 0) {
      // Successful response shapes always carry `ts`; if Slack drops
      // it, treat as transport (we can't make idempotent edits later).
      return yield* Effect.fail({
        _tag: "SlackTransportError" as const,
        operation: "chat.postMessage",
        cause: response,
      } as never)
    }

    return { messageTs: response.ts }
  })
