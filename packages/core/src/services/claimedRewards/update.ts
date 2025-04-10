import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { claimedRewards } from '../../schema'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export async function updateRewardClaim(
  {
    claimId,
    isValid,
  }: {
    claimId: number
    isValid: boolean | null
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .update(claimedRewards)
      .set({
        isValid,
      })
      .where(eq(claimedRewards.id, claimId))
      .returning()

    const updatedClaimedReward = result[0]
    if (!updatedClaimedReward) {
      return Result.error(new NotFoundError('Claimed reward not found'))
    }

    return Result.ok(updatedClaimedReward)
  }, db)
}
