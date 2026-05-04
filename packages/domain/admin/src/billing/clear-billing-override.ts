import { BillingOverrideRepository } from "@domain/billing"
import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"

export interface ClearBillingOverrideInput {
  readonly organizationId: OrganizationId
}

export const clearBillingOverrideUseCase = Effect.fn("admin.clearBillingOverride")(function* (
  input: ClearBillingOverrideInput,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)

  const repo = yield* BillingOverrideRepository
  yield* repo.deleteByOrganizationId(input.organizationId)
})
