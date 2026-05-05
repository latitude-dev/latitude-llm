import { MembershipRepository, updateOrganizationUseCase } from "@domain/organizations"
import { BadRequestError, type OrganizationId, PermissionError, SettingsReader, type UserId } from "@domain/shared"
import { Effect } from "effect"
import { PRO_PLAN_CONFIG } from "../constants.ts"
import { resolveEffectivePlan } from "./resolve-effective-plan.ts"

export interface UpdateSpendingLimitInput {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly spendingLimitDollars: number | null
}

export const updateSpendingLimitUseCase = Effect.fn("billing.updateSpendingLimit")(function* (
  input: UpdateSpendingLimitInput,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)

  const membershipRepo = yield* MembershipRepository
  const isAdmin = yield* membershipRepo.isAdmin(input.organizationId, input.userId)
  if (!isAdmin) {
    return yield* Effect.fail(
      new PermissionError({
        message: "Only organization owners and admins can manage billing settings",
        organizationId: input.organizationId,
      }),
    )
  }

  const orgPlan = yield* resolveEffectivePlan(input.organizationId)
  if (orgPlan.plan.slug !== PRO_PLAN_CONFIG.slug) {
    return yield* Effect.fail(
      new BadRequestError({ message: "Custom spending limits are only available on Pro plans" }),
    )
  }

  const spendingLimitCents = input.spendingLimitDollars === null ? null : Math.round(input.spendingLimitDollars * 100)

  if (spendingLimitCents !== null && spendingLimitCents < PRO_PLAN_CONFIG.priceCents) {
    return yield* Effect.fail(
      new BadRequestError({
        message: `Spending limit must be at least $${(PRO_PLAN_CONFIG.priceCents / 100).toFixed(2)}`,
      }),
    )
  }

  const settingsReader = yield* SettingsReader
  const currentSettings = (yield* settingsReader.getOrganizationSettings()) ?? {}
  const currentBillingSettings = currentSettings.billing ?? {}
  const { billing: _billing, ...settingsWithoutBilling } = currentSettings
  const nextBillingSettings =
    spendingLimitCents === null
      ? Object.fromEntries(Object.entries(currentBillingSettings).filter(([key]) => key !== "spendingLimitCents"))
      : { ...currentBillingSettings, spendingLimitCents }

  const nextSettings = {
    ...settingsWithoutBilling,
    ...(Object.keys(nextBillingSettings).length > 0 ? { billing: nextBillingSettings } : {}),
  }

  yield* updateOrganizationUseCase({ settings: nextSettings })
})
