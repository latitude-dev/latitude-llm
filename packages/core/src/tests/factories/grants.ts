import { database } from '../../client'
import { Grant, GrantSource, Quota, QuotaType } from '../../constants'
import { grants } from '../../schema/models/grants'
import { Workspace } from '../../schema/types'

export async function createGrant({
  type,
  amount,
  balance,
  source,
  referenceId,
  workspace,
  expiresAt,
  idempotencyKey,
}: {
  type: QuotaType
  amount: Quota
  balance?: number
  source: GrantSource
  referenceId: string
  workspace: Workspace
  expiresAt?: Date
  idempotencyKey?: string
}) {
  const result = await database
    .insert(grants)
    .values({
      uuid: idempotencyKey,
      workspaceId: workspace.id,
      referenceId: referenceId,
      source: source,
      type: type,
      amount: typeof amount === 'number' ? amount : null,
      balance: balance ?? (typeof amount === 'number' ? amount : 0),
      expiresAt: expiresAt,
    })
    .returning()
    .then((r) => r[0]!)

  const grant = {
    ...result,
    amount: (result.amount ?? 'unlimited') as Quota,
  } as Grant

  return grant
}
