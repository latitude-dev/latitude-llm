import type { RepositoryError, SlackDeliveryId, SlackIntegrationId, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * Outcome of a `claim` attempt. A row is created exactly once per
 * `(idempotency_key, channel_id)` pair — the partial unique index
 * absorbs concurrent claims so only one caller sees
 * `{ claimed: true }`. Losers see `{ claimed: false, deliveryId: null }`
 * and short-circuit.
 */
export interface SlackDeliveryClaim {
  readonly claimed: boolean
  readonly deliveryId: SlackDeliveryId | null
}

export interface SlackDeliveryRepositoryShape {
  /**
   * Atomically inserts a claim row. If the row already exists (another
   * worker is in-flight, or already posted), returns `claimed: false`
   * and the caller MUST skip posting — the design intentionally favors
   * "zero duplicates" over "guaranteed delivery", since duplicate
   * messages in a Slack channel are loud and confusing.
   *
   * Implementations should run `INSERT … ON CONFLICT (idempotency_key,
   * channel_id) DO NOTHING RETURNING id` so the index is the
   * concurrency primitive — not application-level locking.
   */
  claim(input: {
    readonly integrationId: SlackIntegrationId
    readonly idempotencyKey: string
    readonly channelId: string
  }): Effect.Effect<SlackDeliveryClaim, RepositoryError, SqlClient>

  /**
   * Stamps `posted_at = NOW()` and `message_ts = ?` on a successful
   * post. Returns `true` if the row was updated (it should always be,
   * given the caller just claimed it).
   */
  markPosted(deliveryId: SlackDeliveryId, messageTs: string): Effect.Effect<boolean, RepositoryError, SqlClient>

  /**
   * Returns the `message_ts` of a prior delivery for the given
   * `(idempotencyKey, channelId)` pair, or `null` if no posted delivery
   * exists. Used by `dispatchSlackNotificationUseCase` to look up the
   * original `incident.opened` message when threading
   * `incident.closed` as a reply.
   */
  findMessageTs(idempotencyKey: string, channelId: string): Effect.Effect<string | null, RepositoryError, SqlClient>
}

export class SlackDeliveryRepository extends Context.Service<SlackDeliveryRepository, SlackDeliveryRepositoryShape>()(
  "@domain/integrations/SlackDeliveryRepository",
) {}
