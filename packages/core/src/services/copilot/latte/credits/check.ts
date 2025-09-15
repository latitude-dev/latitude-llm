import {
  LATTE_MINIMUM_CREDITS_PER_REQUEST,
  Workspace,
} from '../../../../browser'
import { database } from '../../../../client'
import { PaymentRequiredError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import { usageLatteCredits } from './usage'

export async function checkLatteCredits(
  {
    credits,
    workspace,
  }: {
    credits?: number
    workspace: Workspace
  },
  db = database,
) {
  if (!credits) {
    credits = LATTE_MINIMUM_CREDITS_PER_REQUEST
  }

  const counting = await usageLatteCredits({ workspace, fresh: true }, db)
  if (counting.error) {
    return Result.error(counting.error)
  }
  const usage = counting.value

  if (usage.limit === 'unlimited') {
    return Result.ok(true)
  }

  if (usage.billable + credits > usage.limit) {
    return Result.error(
      new PaymentRequiredError(
        'You have reached the maximum number of Latte credits allowed for your Latitude plan. Upgrade now.',
      ),
    )
  }

  return Result.ok(true)
}
