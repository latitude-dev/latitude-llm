import { endOfDay, subDays } from 'date-fns'
import { and, eq } from 'drizzle-orm'
import { Grant, GrantSource, Quota, QuotaType } from '../../constants'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { grants } from '../../schema/models/grants'
import { Workspace } from '../../schema/types'
import { findWorkspaceSubscription } from '../subscriptions/data-access/find'

export async function revokeGrant(
  {
    grant,
    workspace,
  }: {
    grant: Grant
    workspace: Workspace
  },
  tx = new Transaction(),
) {
  return await tx.call(async () => {
    const expiring = await expireGrants(
      { filter: eq(grants.id, grant.id), workspace },
      tx,
    )
    if (expiring.error) {
      return Result.error(expiring.error)
    }

    return Result.ok(expiring.value[0]!)
  })
}

export async function revokeGrants(
  {
    type,
    source,
    referenceId,
    workspace,
  }: {
    type?: QuotaType
    source?: GrantSource
    referenceId?: string
    workspace: Workspace
  },
  tx = new Transaction(),
) {
  return await tx.call(async () => {
    const expiring = await expireGrants(
      {
        filter: and(
          ...[
            type ? eq(grants.type, type) : undefined,
            source ? eq(grants.source, source) : undefined,
            referenceId ? eq(grants.referenceId, referenceId) : undefined,
          ].filter(Boolean),
        ),
        workspace: workspace,
      },
      tx,
    )
    if (expiring.error) {
      return Result.error(expiring.error)
    }

    return Result.ok(expiring.value)
  })
}

async function expireGrants(
  {
    filter,
    workspace,
  }: {
    filter: ReturnType<typeof and>
    workspace: Workspace
  },
  tx = new Transaction(),
) {
  return await tx.call(async (db) => {
    const getting = await findWorkspaceSubscription({ workspace }, db)
    if (getting.error) {
      return Result.error(getting.error)
    }
    const subscription = getting.value

    const results = await db
      .update(grants)
      .set({
        balance: 0,
        expiresAt: endOfDay(subDays(subscription.billableFrom, 1)),
        updatedAt: new Date(),
      })
      .where(and(eq(grants.workspaceId, workspace.id), filter))
      .returning()

    const expired = results.map(
      (result) =>
        ({
          ...result,
          amount: (result.amount ?? 'unlimited') as Quota,
        }) as Grant,
    )

    return Result.ok(expired)
  })
}
