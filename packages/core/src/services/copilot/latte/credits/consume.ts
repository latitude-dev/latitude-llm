import { LegacyVercelSDKVersion4Usage as LanguageModelUsage } from '@latitude-data/constants'
import {
  LATTE_MINIMUM_CREDITS_PER_REQUEST,
  LATTE_USAGE_CACHE_KEY,
} from '../../../../constants'
import { type User } from '../../../../schema/models/types/User'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { cache as getCache } from '../../../../cache'
import { Result } from '../../../../lib/Result'
import Transaction from '../../../../lib/Transaction'
import { latteRequests } from '../../../../schema/models/latteRequests'
import { captureException } from '../../../../utils/workers/datadog'
import { WebsocketClient } from '../../../../websockets/workers'
import { computeLatteCredits } from './compute'
import { usageLatteCredits } from './usage'
import { isAbortError } from '../../../../lib/isAbortError'

export async function consumeLatteCredits(
  {
    usage,
    threadUuid,
    user,
    workspace,
    error,
    idempotencyKey,
  }: {
    usage: LanguageModelUsage
    threadUuid: string
    user: User
    workspace: Workspace
    error?: Error
    idempotencyKey?: string
  },
  tx = new Transaction(),
) {
  let credits = LATTE_MINIMUM_CREDITS_PER_REQUEST
  const computing = await computeLatteCredits({ usage, workspace }, tx)
  if (computing.error) error = computing.error
  else credits = computing.value

  const billable = !error || isAbortError(error)

  const consuming = await tx.call(async (db) => {
    const request = await db
      .insert(latteRequests)
      .values({
        uuid: idempotencyKey,
        workspaceId: workspace.id,
        userId: user.id,
        threadUuid: threadUuid,
        credits: credits,
        billable: billable,
        error: error?.message,
      })
      .returning()
      .then((r) => r[0]!)

    return Result.ok(request)
  })
  if (consuming.error) {
    return Result.error(consuming.error)
  }
  const request = consuming.value

  try {
    const cache = await getCache()
    const key = LATTE_USAGE_CACHE_KEY(workspace.id)
    await cache.del(key)
  } catch (error) {
    captureException(error as Error) // Note: failing silently
  }

  const counting = await usageLatteCredits({ workspace, fresh: true })
  if (counting.ok) {
    const usage = counting.value
    WebsocketClient.sendEvent('latteThreadUpdate', {
      workspaceId: workspace.id,
      data: { type: 'usage', threadUuid, usage },
    })
  }

  return Result.ok(request)
}
