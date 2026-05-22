import { generateId, type SlackDeliveryId } from "@domain/shared"
import { Effect, Layer } from "effect"
import { SlackDeliveryRepository } from "../ports/slack-delivery-repository.ts"

/**
 * In-memory test double for {@link SlackDeliveryRepository}. Mirrors
 * the DB-level uniqueness on `(idempotency_key, channel_id)` so
 * use-case tests for `dispatchSlackNotificationUseCase` see the same
 * "second claim is a no-op" behaviour the live adapter provides.
 */
export const InMemorySlackDeliveryRepositoryLive = (init?: { readonly seedClaimedKeys?: ReadonlyArray<string> }) => {
  // Map<`${idempotencyKey}::${channelId}`, { id, postedAt, messageTs }>
  const rows = new Map<string, { id: SlackDeliveryId; postedAt: Date | null; messageTs: string | null }>()
  for (const seeded of init?.seedClaimedKeys ?? []) {
    rows.set(seeded, { id: generateId<"SlackDeliveryId">(), postedAt: null, messageTs: null })
  }

  const claimKey = (idempotencyKey: string, channelId: string): string => `${idempotencyKey}::${channelId}`

  return Layer.succeed(SlackDeliveryRepository, {
    claim: ({ idempotencyKey, channelId }) =>
      Effect.sync(() => {
        const key = claimKey(idempotencyKey, channelId)
        const existing = rows.get(key)
        if (existing) return { claimed: false, deliveryId: null }
        const id = generateId<"SlackDeliveryId">()
        rows.set(key, { id, postedAt: null, messageTs: null })
        return { claimed: true, deliveryId: id }
      }),

    markPosted: (deliveryId, messageTs) =>
      Effect.sync(() => {
        for (const [key, row] of rows.entries()) {
          if (row.id === deliveryId) {
            rows.set(key, { id: row.id, postedAt: new Date(), messageTs })
            return true
          }
        }
        return false
      }),

    findMessageTs: (idempotencyKey, channelId) =>
      Effect.sync(() => {
        const row = rows.get(claimKey(idempotencyKey, channelId))
        return row?.messageTs ?? null
      }),
  })
}
