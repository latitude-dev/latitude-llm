import { addMonths } from 'date-fns'
import { Grant, Quota } from '@latitude-data/constants/grants'
import { GrantSource, QuotaType } from '../../constants'
import { LATTE_USAGE_CACHE_KEY } from '../../constants'
import { Workspace } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { grants } from '../../schema/models/grants'
import { findWorkspaceSubscription } from '../subscriptions/data-access/find'
import { validateGrant } from './validate'
import { captureException } from '../../utils/workers/sentry'
import { cache as getCache } from '../../cache'

export async function issueGrant(
  {
    type,
    amount,
    source,
    referenceId,
    workspace,
    periods,
    expiresAt,
    idempotencyKey,
  }: {
    type: QuotaType
    amount: Quota
    source: GrantSource
    referenceId: string
    workspace: Workspace
    periods?: number
    expiresAt?: Date
    idempotencyKey?: string
  },
  tx = new Transaction(),
) {
  return await tx.call(async (db) => {
    const validation = await validateGrant(
      { type, amount, source, workspace, periods, expiresAt, idempotencyKey },
      db,
    )
    if (validation.error) {
      return Result.error(validation.error)
    }

    if (periods) {
      const getting = await findWorkspaceSubscription({ workspace }, db)
      if (getting.error) {
        return Result.error(getting.error)
      }
      const subscription = getting.value
      expiresAt = addMonths(subscription.billableFrom, periods)
    }

    const result = await db
      .insert(grants)
      .values({
        uuid: idempotencyKey,
        workspaceId: workspace.id,
        referenceId: referenceId,
        source: source,
        type: type,
        amount: typeof amount === 'number' ? amount : null,
        balance: typeof amount === 'number' ? amount : 0,
        expiresAt: expiresAt,
      })
      .returning()
      .then((r) => r[0]!)

    const grant = {
      ...result,
      amount: (result.amount ?? 'unlimited') as Quota,
    } as Grant

    if (type === QuotaType.Credits) {
      try {
        const cache = await getCache()
        const key = LATTE_USAGE_CACHE_KEY(workspace.id)
        await cache.del(key)
      } catch (error) {
        captureException(error as Error) // Note: failing silently
      }
    }

    // TODO - runs dont update automatically when granted an issue

    return Result.ok(grant)
  })
}
