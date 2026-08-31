import { OutboxEventWriter } from "@domain/events"
import { type NotFoundError, type PartnerId, type RepositoryError, SqlClient, toRepositoryError } from "@domain/shared"
import { randomToken } from "@repo/utils"
import { Effect } from "effect"
import { PARTNER_SECRET_LENGTH } from "../constants.ts"
import { createPartner, type Partner, type PartnerScope } from "../entities/partner.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"

export interface CreatePartnerInput {
  readonly id?: PartnerId | undefined
  readonly adminUserId: string
  readonly name: string
  readonly iconUrl?: string | null
  readonly redirectUrls: readonly string[]
  readonly scopes: readonly PartnerScope[]
  readonly allowedIps?: readonly string[]
}

export interface CreatePartnerResult {
  readonly partner: Partner
  /** Shown to staff exactly once — only its ciphertext is persisted. */
  readonly rawSecret: string
}

export const createPartnerUseCase = Effect.fn("partners.createPartner")(function* (input: CreatePartnerInput) {
  const sqlClient = yield* SqlClient

  const rawSecret = randomToken(PARTNER_SECRET_LENGTH)
  const partner = createPartner({
    id: input.id,
    name: input.name,
    iconUrl: input.iconUrl ?? null,
    redirectUrls: input.redirectUrls,
    scopes: input.scopes,
    allowedIps: input.allowedIps,
  })

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const partners = yield* PartnerRepository
      const outboxEventWriter = yield* OutboxEventWriter

      yield* partners.save(partner, { hmacSecret: rawSecret })

      yield* outboxEventWriter
        .write({
          eventName: "AdminPartnerCreated",
          aggregateType: "partner",
          aggregateId: partner.id,
          organizationId: "system",
          payload: { adminUserId: input.adminUserId, partnerId: partner.id, name: partner.name },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

      return { partner, rawSecret } satisfies CreatePartnerResult
    }),
  )
}) satisfies (
  input: CreatePartnerInput,
) => Effect.Effect<
  CreatePartnerResult,
  NotFoundError | RepositoryError,
  SqlClient | PartnerRepository | OutboxEventWriter
>
