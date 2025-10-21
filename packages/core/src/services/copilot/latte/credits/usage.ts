import { cache as getCache } from '../../../../cache'
import { database } from '../../../../client'
import {
  LATTE_USAGE_CACHE_KEY,
  LATTE_USAGE_CACHE_TTL,
  LatteUsage,
  QuotaType,
} from '../../../../constants'
import { Result } from '../../../../lib/Result'
import { LatteRequestsRepository } from '../../../../repositories'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { captureException } from '../../../../utils/workers/datadog'
import { computeQuota } from '../../../grants/quota'
import { findWorkspaceSubscription } from '../../../subscriptions/data-access/find'

export async function usageLatteCredits(
  {
    workspace,
    fresh = false,
  }: {
    workspace: Workspace
    fresh?: boolean
  },
  db = database,
) {
  const getting = await findWorkspaceSubscription({ workspace }, db)
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

  const quoting = await computeQuota({ type: QuotaType.Credits, workspace })
  if (quoting.error) {
    return Result.error(quoting.error)
  }

  usage = {
    limit: quoting.value.limit,
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
