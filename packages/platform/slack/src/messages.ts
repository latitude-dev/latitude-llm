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

    const bodyBlocks = input.color
      ? { attachments: [{ color: input.color, blocks: [...input.blocks] }] }
      : { blocks: [...input.blocks] }

    const response = yield* Effect.tryPromise({
      try: () =>
        input.threadTs
          ? client.chat.postMessage({
              channel: input.channelId,
              text: input.text,
              thread_ts: input.threadTs,
              reply_broadcast: input.replyBroadcast === true,
              ...bodyBlocks,
            })
          : client.chat.postMessage({
              channel: input.channelId,
              text: input.text,
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
