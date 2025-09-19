import { addMonths } from 'date-fns'
import {
  Grant,
  GrantSource,
  LATTE_USAGE_CACHE_KEY,
  Quota,
  QuotaType,
  Workspace,
} from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { grants } from '../../schema'
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
    if (!Result.isOk(validation)) {
      return Result.error(validation.error)
    }

    if (periods) {
      const getting = await findWorkspaceSubscription({ workspace }, db)
      if (!Result.isOk(getting)) {
        return Result.error(getting.error)
      }
      const subscription = getting.unwrap()
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
