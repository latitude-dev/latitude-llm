import { PaymentRequiredError } from '@latitude-data/constants/errors'
import { isPayingOrTrialing } from '../../plans'
import { Result, TypedResult } from '../../lib/Result'
import { Subscription } from '../../schema/models/types/Subscription'

/**
 * Checks if the workspace subscription is either a paying plan or in an active trial.
 * Throws PaymentRequiredError if the trial has ended and no payment is set up.
 */
export async function checkPayingOrTrial({
  subscription,
}: {
  subscription: Subscription
}): Promise<TypedResult<void, PaymentRequiredError>> {
  const canUsePaidFeatures = isPayingOrTrialing({
    plan: subscription.plan,
    trialEndsAt: subscription.trialEndsAt,
  })

  if (!canUsePaidFeatures) {
    return Result.error(
      new PaymentRequiredError(
        'Your trial has ended. Please upgrade to continue using Latitude.',
      ),
    )
  }

  return Result.nil()
}
