import { index, text, uniqueIndex } from "drizzle-orm/pg-core"
import { cuid, latitudeSchema, organizationRLSPolicy, tzTimestamp } from "../schemaHelpers.ts"

/**
 * Idempotency claim ledger for Slack channel deliveries. One row per
 * `(idempotency_key, channel_id)` pair: the unique index is the
 * concurrency primitive — two workers racing the same notification +
 * channel both attempt the insert; the loser sees a unique violation
 * and short-circuits without ever calling Slack.
 *
 * Lifecycle:
 *   - `claimed_at` is stamped on INSERT.
 *   - `posted_at` + `message_ts` are stamped after a successful
 *     `chat.postMessage`. Rows with `posted_at IS NULL` are either
 *     in-flight or stranded by a worker crash; we **don't retry** them,
 *     because re-posting could double up in the channel.
 *
 * `organization_id` is denormalized so the standard
 * `organizationRLSPolicy` applies; the integration's row is the source
 * of truth and the application writes both consistently.
 *
 * No FK on `integration_id` (per the platform no-FK rule); the column
 * is a plain cuid and the index supports the "list deliveries for an
 * integration" admin / debug query.
 */
export const slackDeliveries = latitudeSchema.table(
  "slack_deliveries",
  {
    id: cuid("id").primaryKey(),
    organizationId: cuid("organization_id").notNull(),
    integrationId: cuid("integration_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    channelId: text("channel_id").notNull(),
    claimedAt: tzTimestamp("claimed_at").defaultNow().notNull(),
    postedAt: tzTimestamp("posted_at"),
    messageTs: text("message_ts"),
  },
  (t) => [
    organizationRLSPolicy("slack_deliveries"),
    // Concurrency primitive: two workers racing the same delivery
    // both INSERT; only one wins.
    uniqueIndex("slack_deliveries_claim_uq").on(t.idempotencyKey, t.channelId),
    // Debug / admin query path.
    index("slack_deliveries_integration_idx").on(t.integrationId),
  ],
)
