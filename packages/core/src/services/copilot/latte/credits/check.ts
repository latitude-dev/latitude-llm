import {
  LATTE_MINIMUM_CREDITS_PER_REQUEST,
  LATTE_NOT_ENOUGH_CREDITS_ERROR,
  Workspace,
} from '../../../../browser'
import { UnprocessableEntityError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import Transaction from '../../../../lib/Transaction'
import { usageLatteCredits } from './usage'

export async function checkLatteCredits(
  {
    credits,
    workspace,
  }: {
    credits?: number
    workspace: Workspace
  },
  tx = new Transaction(),
) {
  if (!credits) {
    credits = LATTE_MINIMUM_CREDITS_PER_REQUEST
  }

  const counting = await usageLatteCredits({ workspace, fresh: true }, tx)
  if (counting.error) {
    return Result.error(counting.error)
  }
  const usage = counting.value

  if (usage.included === 'unlimited') {
    return Result.ok(true)
  }

  if (usage.billable + credits > usage.included) {
    return Result.error(
      new UnprocessableEntityError(LATTE_NOT_ENOUGH_CREDITS_ERROR),
    )
  }

  return Result.ok(true)
}
