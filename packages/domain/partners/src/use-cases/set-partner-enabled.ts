import { OutboxEventWriter } from "@domain/events"
import { type PartnerId, SqlClient, toRepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { PartnerRepository } from "../ports/partner-repository.ts"

export const setPartnerEnabledUseCase = Effect.fn("partners.setPartnerEnabled")(function* (input: {
  readonly id: PartnerId
  readonly adminUserId: string
  readonly enabled: boolean
}) {
  const sqlClient = yield* SqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const partners = yield* PartnerRepository
      const outboxEventWriter = yield* OutboxEventWriter

      const existing = yield* partners.findById(input.id)
      const updated = { ...existing, enabled: input.enabled, updatedAt: new Date() }
      yield* partners.save(updated)

      yield* outboxEventWriter
        .write({
          eventName: "AdminPartnerUpdated",
          aggregateType: "partner",
          aggregateId: updated.id,
          organizationId: "system",
          payload: {
            adminUserId: input.adminUserId,
            partnerId: updated.id,
            name: updated.name,
            changes: ["enabled"],
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

      return updated
    }),
  )
})
