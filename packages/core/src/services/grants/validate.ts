import { database } from '../../client'
import { GrantSource, Quota, QuotaType } from '../../constants'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { GrantsRepository } from '../../repositories'
import { type Workspace } from '../../schema/models/types/Workspace'

export async function validateGrant(
  {
    amount,
    workspace,
    periods,
    expiresAt,
    idempotencyKey,
  }: {
    type: QuotaType
    amount: Quota
    source: GrantSource
    workspace: Workspace
    periods?: number
    expiresAt?: Date
    idempotencyKey?: string
  },
  db = database,
) {
  const now = new Date()

  if (typeof amount === 'number') {
    if (amount < 1) {
      return Result.error(
        new BadRequestError('Can only grant positive amounts'),
      )
    }
  } else if (typeof amount === 'string') {
    if (amount !== 'unlimited') {
      return Result.error(
        new BadRequestError('Invalid unlimited sentinel value'),
      )
    }
  } else {
    return Result.error(new BadRequestError('Invalid grant amount'))
  }

  if (periods !== undefined && periods < 1) {
    return Result.error(new BadRequestError('Grant already expired'))
  }

  if (expiresAt !== undefined && expiresAt < now) {
    return Result.error(new BadRequestError('Grant already expired'))
  }

  if (idempotencyKey) {
    const repository = new GrantsRepository(workspace.id, db)
    const existing = await repository.findByUuid(idempotencyKey)
    if (existing.value) {
      return Result.error(new BadRequestError('Grant already exists'))
    }
  }

  return Result.ok(true)
}
