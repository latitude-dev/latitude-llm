import { Effect } from "effect"
import { PartnerRepository } from "../ports/partner-repository.ts"

export const listPartnersUseCase = Effect.fn("partners.listPartners")(function* () {
  const partners = yield* PartnerRepository
  return yield* partners.list()
})
