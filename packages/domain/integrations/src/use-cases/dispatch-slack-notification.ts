import type { IssueRepository } from "@domain/issues"
import { NOTIFICATION_KIND_META, type NotificationKind } from "@domain/notifications"
import type { RepositoryError, SlackIntegrationId, SqlClient } from "@domain/shared"
import { Data, Effect } from "effect"
import { SlackDeliveryRepository } from "../ports/slack-delivery-repository.ts"
import { NOTIFICATION_SLACK_RENDERERS } from "../templates/notifications/registry.ts"
import { RenderSlackError, type SlackRenderContext } from "../templates/notifications/types.ts"

/**
 * Port for the actual Slack post call. The worker provides the live
 * adapter (`@platform/slack` `postMessage`); use-case tests pass a
 * fake that records calls and returns a synthetic ts.
 */
export interface SlackMessenger {
  readonly post: (input: {
    readonly botToken: string
    readonly channelId: string
    readonly text: string
    readonly blocks: readonly unknown[]
    readonly color?: string
    readonly threadTs?: string
    readonly replyBroadcast?: boolean
  }) => Effect.Effect<{ readonly messageTs: string }, SlackMessengerError, never>
}

export class SlackMessengerError extends Data.TaggedError("SlackMessengerError")<{
  readonly reason: "auth" | "channel-gone" | "rate-limited" | "transport"
  readonly retryAfterSec?: number
  readonly cause?: unknown
}> {
  override get message() {
    return `Slack post failed (${this.reason})`
  }
}

export type DispatchSlackOutcome =
  | { readonly status: "delivered"; readonly messageTs: string }
  | { readonly status: "skipped-already-delivered" }

export interface DispatchSlackNotificationInput {
  readonly integrationId: SlackIntegrationId
  readonly botToken: string
  readonly channelId: string
  readonly kind: NotificationKind
  readonly payload: unknown
  readonly idempotencyKey: string
  readonly context: SlackRenderContext
  readonly messenger: SlackMessenger
}

export type DispatchSlackNotificationError = SlackMessengerError | RenderSlackError | RepositoryError

/**
 * Claim-then-render-then-post-then-stamp. Idempotency comes from the
 * `(idempotency_key, channel_id)` unique index on `slack_deliveries`:
 * a second worker reading the same job loses the claim and exits with
 * `skipped-already-delivered`. If the post fails mid-flight, the row
 * stays in `posted_at IS NULL` state — intentional, because retrying
 * would risk a duplicate post in the channel.
 *
 * Threading: `incident.closed` is posted as a thread reply to the
 * paired `incident.opened` message (looked up via `slack_deliveries`),
 * with `reply_broadcast: true` so it also appears in the channel feed.
 * If no prior delivery is found, it falls back to a top-level message.
 */
export const dispatchSlackNotificationUseCase = (
  input: DispatchSlackNotificationInput,
): Effect.Effect<
  DispatchSlackOutcome,
  DispatchSlackNotificationError,
  SqlClient | SlackDeliveryRepository | IssueRepository
> =>
  Effect.gen(function* () {
    const deliveryRepo = yield* SlackDeliveryRepository
    const claim = yield* deliveryRepo.claim({
      integrationId: input.integrationId,
      idempotencyKey: input.idempotencyKey,
      channelId: input.channelId,
    })
    if (!claim.claimed || claim.deliveryId === null) {
      return { status: "skipped-already-delivered" as const }
    }

    const renderer = NOTIFICATION_SLACK_RENDERERS[input.kind]
    const payloadSchema = NOTIFICATION_KIND_META[input.kind].payload
    const parsed = payloadSchema.safeParse(input.payload)
    if (!parsed.success) {
      return yield* Effect.fail(
        new RenderSlackError({ kind: input.kind, reason: "invalid-payload", cause: parsed.error }),
      )
    }

    const rendered = yield* (renderer as (p: unknown, c: SlackRenderContext) => ReturnType<typeof renderer>)(
      parsed.data,
      input.context,
    )

    // For incident.closed, thread the reply under the original
    // incident.opened message so the channel shows a tidy lifecycle
    // rather than two unrelated top-level messages.
    let threadTs: string | undefined
    if (input.kind === "incident.closed") {
      const closedPayload = parsed.data as { alertIncidentId: string }
      const openedKey = `incident.opened:${closedPayload.alertIncidentId}`
      const found = yield* deliveryRepo.findMessageTs(openedKey, input.channelId)
      threadTs = found ?? undefined
    }

    const posted = yield* input.messenger.post({
      botToken: input.botToken,
      channelId: input.channelId,
      text: rendered.text,
      blocks: rendered.blocks,
      ...(rendered.color !== undefined ? { color: rendered.color } : {}),
      ...(threadTs !== undefined ? { threadTs, replyBroadcast: true as const } : {}),
    })

    yield* deliveryRepo.markPosted(claim.deliveryId, posted.messageTs)

    return { status: "delivered" as const, messageTs: posted.messageTs }
  })
