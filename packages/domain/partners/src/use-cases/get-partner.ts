import type { PartnerId } from "@domain/shared"
import { Effect } from "effect"
import { PartnerRepository } from "../ports/partner-repository.ts"

export const getPartnerUseCase = Effect.fn("partners.getPartner")(function* (input: { readonly id: PartnerId }) {
  const partners = yield* PartnerRepository
  return yield* partners.findById(input.id)
})
