import { PaymentRequiredError } from '@latitude-data/constants/errors'
import { QuotaType, Workspace } from '../../../browser'
import { cache } from '../../../cache'
import { getUsageFromCache } from '../../workspaces'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { computeQuota } from '../../grants/quota'

export async function applyCreditPlanLimit({
  workspace,
}: {
  workspace: Workspace
}): PromisedResult<void, PaymentRequiredError> {
  const cacheClient = await cache()
  const cacheKey = `workspace-usage-${workspace.id}`
  const usage = await getUsageFromCache(cacheClient, cacheKey)
  if (!usage) return Result.nil()

  const quota = await computeQuota({ type: QuotaType.Runs, workspace }).then(
    (r) => r.value,
  )
  // should not be possible but we are nice and opt for letting the request
  // continue...void
  if (!quota) return Result.nil()
  if (quota.limit === 'unlimited') return Result.nil()
  if (usage >= Number(quota.limit)) {
    return Result.error(
      new PaymentRequiredError(
        'You have reached the maximum number of runs allowed for your Latitude plan. Upgrade now.',
      ),
    )
  }

  return Result.nil()
}
