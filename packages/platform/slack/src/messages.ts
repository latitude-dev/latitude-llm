import type { KnownBlock } from "@slack/web-api"
import { Effect } from "effect"
import { createSlackClient } from "./client.ts"
import { mapSlackError } from "./conversations.ts"
import type { SlackAuthError, SlackChannelGoneError, SlackRateLimitError, SlackTransportError } from "./errors.ts"

/**
 * Posts a message to a Slack channel as the bot.
 *
 * `text` is required — powers mobile push, screen readers, and the
 * fallback display when blocks fail to render.
 *
 * `color`: when present, `blocks` are wrapped in a Slack `attachment`
 * to produce a left-side color bar (hex string, e.g. `#E8534B`). The
 * colored-attachment path is the modern way to add the bar since Slack
 * deprecated `color` on top-level messages but retains it on
 * attachments that contain Block Kit blocks.
 *
 * `threadTs`: when present, the message is posted as a reply in that
 * thread. Combined with `replyBroadcast: true` ("also send to channel")
 * so it appears in the channel feed as well.
 *
 * Returns the message `ts` for later thread replies or edits.
 */
export const postMessage = (input: {
  readonly botToken: string
  readonly channelId: string
  readonly text: string
  readonly blocks: readonly KnownBlock[]
  readonly color?: string
  readonly threadTs?: string
  readonly replyBroadcast?: boolean
}): Effect.Effect<
  { readonly messageTs: string },
  SlackAuthError | SlackChannelGoneError | SlackRateLimitError | SlackTransportError,
  never
> =>
  Effect.gen(function* () {
    const client = createSlackClient(input.botToken)

    // When a color bar is requested, wrap blocks in an `attachment`.
    // The attachment's `fallback` carries the summary text for push
    // notifications / screen readers; the top-level `text` is left
    // empty so Slack doesn't render a duplicate plain-text line above
    // the colored card.
    const bodyBlocks = input.color
      ? { text: "", attachments: [{ color: input.color, fallback: input.text, blocks: [...input.blocks] }] }
      : { text: input.text, blocks: [...input.blocks] }

    const response = yield* Effect.tryPromise({
      try: () =>
        input.threadTs
          ? client.chat.postMessage({
              channel: input.channelId,
              thread_ts: input.threadTs,
              reply_broadcast: input.replyBroadcast === true,
              ...bodyBlocks,
            })
          : client.chat.postMessage({
              channel: input.channelId,
              ...bodyBlocks,
            }),
      catch: (cause) => mapSlackError(cause, "chat.postMessage"),
    })

    if (typeof response.ts !== "string" || response.ts.length === 0) {
      return yield* Effect.fail({
        _tag: "SlackTransportError" as const,
        operation: "chat.postMessage",
        cause: response,
      } as never)
    }

    return { messageTs: response.ts }
  })
