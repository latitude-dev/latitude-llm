import { type BillingOverride, BillingOverrideRepository, type PlanSlug } from "@domain/billing"
import { generateId, type OrganizationId } from "@domain/shared"
import { Effect } from "effect"

export interface UpsertBillingOverrideInput {
  readonly organizationId: OrganizationId
  readonly plan: PlanSlug
  readonly includedCredits: number | null
  readonly retentionDays: number | null
  readonly notes: string | null
}

export const upsertBillingOverrideUseCase = Effect.fn("admin.upsertBillingOverride")(function* (
  input: UpsertBillingOverrideInput,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)

  const repo = yield* BillingOverrideRepository
  const existing = yield* repo.findByOrganizationId(input.organizationId)
  const now = new Date()

  const override: BillingOverride = {
    id: existing?.id ?? generateId(),
    organizationId: input.organizationId,
    plan: input.plan,
    includedCredits: input.includedCredits,
    retentionDays: input.retentionDays,
    notes: input.notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  yield* repo.upsert(override)
})
