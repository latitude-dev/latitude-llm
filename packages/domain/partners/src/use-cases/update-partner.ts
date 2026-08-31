import { OutboxEventWriter } from "@domain/events"
import { type PartnerId, SqlClient, toRepositoryError } from "@domain/shared"
import { Effect } from "effect"
import type { Partner, PartnerScope } from "../entities/partner.ts"
import { partnerSchema } from "../entities/partner.ts"
import { PartnerRepository } from "../ports/partner-repository.ts"

export interface UpdatePartnerInput {
  readonly id: PartnerId
  readonly adminUserId: string
  readonly name: string
  readonly iconUrl: string | null
  readonly redirectUrls: readonly string[]
  readonly scopes: readonly PartnerScope[]
  readonly allowedIps: readonly string[]
}

/** Order-insensitive: both fields are sets, and reordering checkboxes or textarea lines isn't an edit. */
const sameEntries = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false
  const sortedB = [...b].sort()
  return [...a].sort().every((value, index) => value === sortedB[index])
}

/** Entity field names that differ, for the audit event's `changes`. Never carries values. */
const changedFields = (previous: Partner, updated: Partner): string[] => {
  const changes: string[] = []
  if (previous.name !== updated.name) changes.push("name")
  if (previous.iconUrl !== updated.iconUrl) changes.push("iconUrl")
  if (!sameEntries(previous.redirectUrls, updated.redirectUrls)) changes.push("redirectUrls")
  if (!sameEntries(previous.scopes, updated.scopes)) changes.push("scopes")
  if (!sameEntries(previous.allowedIps, updated.allowedIps)) changes.push("allowedIps")
  if (previous.enabled !== updated.enabled) changes.push("enabled")
  return changes
}

export const updatePartnerUseCase = Effect.fn("partners.updatePartner")(function* (input: UpdatePartnerInput) {
  const sqlClient = yield* SqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const partners = yield* PartnerRepository
      const outboxEventWriter = yield* OutboxEventWriter

      const existing = yield* partners.findById(input.id)
      const updated = partnerSchema.parse({
        ...existing,
        name: input.name,
        iconUrl: input.iconUrl,
        redirectUrls: [...input.redirectUrls],
        scopes: [...input.scopes],
        allowedIps: [...input.allowedIps],
        updatedAt: new Date(),
      })

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
            changes: changedFields(existing, updated),
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

      return updated
    }),
  )
})
