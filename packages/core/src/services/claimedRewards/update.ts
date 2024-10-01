import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { NotFoundError, Result, Transaction } from '../../lib'
import { claimedRewards } from '../../schema'

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
