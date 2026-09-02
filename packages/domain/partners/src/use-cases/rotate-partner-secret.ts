import { OutboxEventWriter } from "@domain/events"
import { type PartnerId, SqlClient, toRepositoryError } from "@domain/shared"
import { randomToken } from "@repo/utils"
import { Effect } from "effect"
import { PARTNER_SECRET_LENGTH } from "../constants.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"

/**
 * Hard swap: the previous secret stops verifying the moment this returns, so
 * rotation doubles as revocation of a leaked secret. Coordinate the handoff
 * with the partner out of band — there is no grace window.
 */
export const rotatePartnerSecretUseCase = Effect.fn("partners.rotatePartnerSecret")(function* (input: {
  readonly id: PartnerId
  readonly adminUserId: string
}) {
  const sqlClient = yield* SqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const partners = yield* PartnerRepository
      const outboxEventWriter = yield* OutboxEventWriter

      const existing = yield* partners.findById(input.id)
      const rawSecret = randomToken(PARTNER_SECRET_LENGTH)
      yield* partners.save({ ...existing, updatedAt: new Date() }, { hmacSecret: rawSecret })

      yield* outboxEventWriter
        .write({
          eventName: "AdminPartnerUpdated",
          aggregateType: "partner",
          aggregateId: existing.id,
          organizationId: "system",
          payload: {
            adminUserId: input.adminUserId,
            partnerId: existing.id,
            name: existing.name,
            changes: ["hmacSecret"],
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

      return { partner: existing, rawSecret }
    }),
  )
})
