import { organizationIdSchema, slackDeliveryIdSchema, slackIntegrationIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * One claim-then-act idempotency row per `(idempotencyKey, channelId)`
 * pair. The row exists whenever a worker has decided to send (or has
 * sent) a notification to a Slack channel. `postedAt` and `messageTs`
 * are stamped after the Slack API call succeeds; a row with
 * `postedAt = null` is either currently in-flight or the worker crashed
 * between claim and post (in which case retries are intentionally
 * blocked — duplicate posts in a channel are louder than missed ones).
 */
export const slackDeliverySchema = z.object({
  id: slackDeliveryIdSchema,
  organizationId: organizationIdSchema,
  integrationId: slackIntegrationIdSchema,
  idempotencyKey: z.string().min(1),
  channelId: z.string().min(1),
  claimedAt: z.date(),
  postedAt: z.date().nullable(),
  messageTs: z.string().nullable(),
})

export type SlackDelivery = z.infer<typeof slackDeliverySchema>
