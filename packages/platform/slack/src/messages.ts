import type { KnownBlock } from "@slack/web-api"
import { Effect } from "effect"
import { createSlackClient } from "./client.ts"
import { mapSlackError } from "./conversations.ts"
import type { SlackAuthError, SlackChannelGoneError, SlackRateLimitError, SlackTransportError } from "./errors.ts"

/**
 * Slack's rejection when it fetched an `image` block's URL and failed: `invalid_blocks`, with the
 * specific reason only in the error list. Matched on that reason rather than the code alone, since
 * `invalid_blocks` also covers malformed blocks that removing images would not fix.
 */
const isImageDownloadFailure = (cause: unknown): boolean => {
  const data = (cause as { data?: { error?: string; errors?: readonly string[] } } | null | undefined)?.data
  return (
    data?.error === "invalid_blocks" &&
    (data.errors ?? []).some((message) => message.includes("downloading image failed"))
  )
}

/**
 * Posts `blocks`, and if Slack rejects them because it could not download an image, posts them
 * again without any `image` block. Any other failure, or a rejection with no image to remove, is
 * passed through untouched.
 *
 * Exported for tests.
 */
export const postWithImageFallback = <A>(
  blocks: readonly KnownBlock[],
  post: (blocks: readonly KnownBlock[]) => Effect.Effect<A, unknown>,
): Effect.Effect<A, unknown> =>
  post(blocks).pipe(
    Effect.catch((cause) => {
      const withoutImages = blocks.filter((block) => block.type !== "image")
      if (!isImageDownloadFailure(cause) || withoutImages.length === blocks.length) {
        return Effect.fail(cause)
      }
      return Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan("slack.image_blocks_dropped", blocks.length - withoutImages.length)
        yield* Effect.logWarning("Slack could not download an image block; reposting without images")
        return yield* post(withoutImages)
      })
    }),
  )

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
 * An `image` block whose URL Slack cannot download makes it reject the whole
 * message with `invalid_blocks`, rather than render around the gap as it
 * does for a section accessory. That is every image on a deploy whose web
 * app is not publicly reachable, so the post is retried once with the image
 * blocks removed. Nothing was posted by the rejected attempt, so the retry
 * cannot duplicate a message; renderers are expected to carry the image's
 * facts in text as well.
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
    const bodyFor = (blocks: readonly KnownBlock[]) =>
      input.color
        ? { text: "", attachments: [{ color: input.color, fallback: input.text, blocks: [...blocks] }] }
        : { text: input.text, blocks: [...blocks] }

    const post = (blocks: readonly KnownBlock[]) =>
      Effect.tryPromise({
        try: () =>
          input.threadTs
            ? client.chat.postMessage({
                channel: input.channelId,
                thread_ts: input.threadTs,
                reply_broadcast: input.replyBroadcast === true,
                ...bodyFor(blocks),
              })
            : client.chat.postMessage({
                channel: input.channelId,
                ...bodyFor(blocks),
              }),
        catch: (cause) => cause,
      })

    const response = yield* postWithImageFallback(input.blocks, post).pipe(
      Effect.mapError((cause) => mapSlackError(cause, "chat.postMessage")),
    )

    if (typeof response.ts !== "string" || response.ts.length === 0) {
      return yield* Effect.fail({
        _tag: "SlackTransportError" as const,
        operation: "chat.postMessage",
        cause: response,
      } as never)
    }

    return { messageTs: response.ts }
  })
