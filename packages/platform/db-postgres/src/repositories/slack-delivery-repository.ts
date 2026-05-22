import { SlackDeliveryRepository } from "@domain/integrations"
import {
  generateId,
  SlackDeliveryId,
  type SlackDeliveryId as SlackDeliveryIdType,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
} from "@domain/shared"
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { slackDeliveries } from "../schema/slack-deliveries.ts"

/**
 * Live adapter for the Slack delivery idempotency ledger. The repo is
 * the only writer to `slack_deliveries`: `claim` inserts a fresh row
 * with `ON CONFLICT DO NOTHING RETURNING id`, and `markPosted` stamps
 * `posted_at` + `message_ts` after a successful `chat.postMessage`.
 *
 * Concurrency: the unique index on `(idempotency_key, channel_id)`
 * makes `claim` race-safe — two workers running the same job both
 * INSERT; only one comes back with a row.
 *
 * RLS: `organization_id` is provided by the SqlClient context, so the
 * default `organizationRLSPolicy` on the table applies to both reads
 * and writes.
 */
export const SlackDeliveryRepositoryLive = Layer.succeed(SlackDeliveryRepository, {
  claim: ({ integrationId, idempotencyKey, channelId }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .insert(slackDeliveries)
            .values({
              id: generateId(),
              organizationId,
              integrationId,
              idempotencyKey,
              channelId,
            })
            .onConflictDoNothing({ target: [slackDeliveries.idempotencyKey, slackDeliveries.channelId] })
            .returning({ id: slackDeliveries.id }),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "claimSlackDelivery")))

      if (rows.length === 0) return { claimed: false, deliveryId: null }
      return { claimed: true, deliveryId: SlackDeliveryId(rows[0]!.id) }
    }),

  markPosted: (deliveryId: SlackDeliveryIdType, messageTs) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(slackDeliveries)
            .set({ postedAt: new Date(), messageTs })
            .where(
              and(
                eq(slackDeliveries.id, deliveryId),
                eq(slackDeliveries.organizationId, organizationId),
                isNull(slackDeliveries.postedAt),
              ),
            )
            .returning({ id: slackDeliveries.id }),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "markSlackDeliveryPosted")))

      return rows.length > 0
    }),

  findMessageTs: (idempotencyKey, channelId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select({ messageTs: slackDeliveries.messageTs })
            .from(slackDeliveries)
            .where(
              and(
                eq(slackDeliveries.idempotencyKey, idempotencyKey),
                eq(slackDeliveries.channelId, channelId),
                eq(slackDeliveries.organizationId, organizationId),
                isNotNull(slackDeliveries.messageTs),
              ),
            )
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findSlackDeliveryMessageTs")))

      return rows[0]?.messageTs ?? null
    }),
})
