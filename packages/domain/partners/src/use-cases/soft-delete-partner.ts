import { OutboxEventWriter } from "@domain/events"
import { type PartnerId, SqlClient, toRepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { PartnerRepository } from "../ports/partner-repository.ts"

export const softDeletePartnerUseCase = Effect.fn("partners.softDeletePartner")(function* (input: {
  readonly id: PartnerId
  readonly adminUserId: string
}) {
  const sqlClient = yield* SqlClient

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      const partners = yield* PartnerRepository
      const outboxEventWriter = yield* OutboxEventWriter

      yield* partners.softDelete(input.id)

      yield* outboxEventWriter
        .write({
          eventName: "AdminPartnerDeleted",
          aggregateType: "partner",
          aggregateId: input.id,
          organizationId: "system",
          payload: { adminUserId: input.adminUserId, partnerId: input.id },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))
    }),
  )
})
