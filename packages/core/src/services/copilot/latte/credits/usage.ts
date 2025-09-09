import {
  LATTE_USAGE_CACHE_KEY,
  LATTE_USAGE_CACHE_TTL,
  LatteUsage,
  Workspace,
} from '../../../../browser'
import { cache as getCache } from '../../../../cache'
import { Result } from '../../../../lib/Result'
import Transaction from '../../../../lib/Transaction'
import { LatteRequestsRepository } from '../../../../repositories'
import { captureException } from '../../../../utils/workers/sentry'
import { getWorkspaceSubscription } from '../../../subscriptions/get'

export async function usageLatteCredits(
  {
    workspace,
    fresh = false,
  }: {
    workspace: Workspace
    fresh?: boolean
  },
  tx = new Transaction(),
) {
  const getting = await getWorkspaceSubscription({ workspace }, tx)
  if (getting.error) {
    return Result.error(getting.error)
  }
  const subscription = getting.value

  let usage: LatteUsage | undefined

  const cache = await getCache()
  const key = LATTE_USAGE_CACHE_KEY(workspace.id)
  if (!fresh) {
    try {
      const item = await cache.get(key)
      if (item) usage = JSON.parse(item)
    } catch (error) {
      captureException(error as Error) // Note: failing silently
    }
    if (usage) {
      return Result.ok({ ...usage, resetsAt: new Date(usage.resetsAt) })
    }
  }

  const requestsRepository = new LatteRequestsRepository(workspace.id)
  const counting = await requestsRepository.usageSinceDate(
    subscription.billableFrom,
  )
  if (counting.error) {
    return Result.error(counting.error)
  }
  usage = {
    // TODO(grants): use grants table instead of this
    included: subscription.plan.latte_credits,
    billable: counting.value.billable,
    unbillable: counting.value.unbillable,
    resetsAt: subscription.billableAt,
  }

  try {
    const item = JSON.stringify(usage)
    await cache.set(key, item, 'EX', LATTE_USAGE_CACHE_TTL)
  } catch (error) {
    captureException(error as Error) // Note: failing silently
  }

  return Result.ok(usage)
}
