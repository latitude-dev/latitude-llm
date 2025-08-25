import { LanguageModelUsage } from 'ai'
import {
  LATTE_COST_FEE_FACTOR,
  LATTE_COST_MODEL,
  LATTE_COST_PER_CREDIT,
  LATTE_COST_PROVIDER,
  LATTE_MINIMUM_CREDITS_PER_REQUEST,
  Providers,
  Workspace,
} from '../../../../browser'
import { Result } from '../../../../lib/Result'
import Transaction from '../../../../lib/Transaction'
import { estimateCost } from '../../../ai/estimateCost'

export async function computeLatteCredits(
  {
    usage,
  }: {
    usage: LanguageModelUsage
    workspace: Workspace
  },
  _ = new Transaction(),
) {
  const cost = Math.ceil(
    estimateCost({
      provider: LATTE_COST_PROVIDER as Providers,
      model: LATTE_COST_MODEL,
      usage: usage,
    }) * 100_000,
  )

  const credits = Math.max(
    LATTE_MINIMUM_CREDITS_PER_REQUEST,
    Math.ceil((cost * LATTE_COST_FEE_FACTOR) / LATTE_COST_PER_CREDIT),
  )

  return Result.ok(credits)
}
