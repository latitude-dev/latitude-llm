import { and, eq, inArray, isNull } from 'drizzle-orm'

import { RewardType } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { claimedRewards } from '../../schema'

export async function claimNewUserReferrals(
  {
    email,
  }: {
    email: string
  },
  db = database,
) {
  // Find all referrals that will be accepted (only one per workspace)
  const acceptedReferrals = await db
    .selectDistinctOn([claimedRewards.workspaceId], {
      claimId: claimedRewards.id,
      workspaceId: claimedRewards.workspaceId,
    })
    .from(claimedRewards)
    .where(
      and(
        eq(claimedRewards.rewardType, RewardType.Referral),
        isNull(claimedRewards.isValid),
        eq(claimedRewards.reference, email),
      ),
    )

  return Transaction.call(async (tx) => {
    // Accept referrals
    await tx
      .update(claimedRewards)
      .set({
        isValid: true,
      })
      .where(
        inArray(
          claimedRewards.id,
          acceptedReferrals.map((r) => r.claimId),
        ),
      )

    // Reject any other pending referral rewards for those workspaces
    await tx
      .update(claimedRewards)
      .set({
        isValid: false,
      })
      .where(
        and(
          eq(claimedRewards.rewardType, RewardType.Referral),
          isNull(claimedRewards.isValid),
          inArray(
            claimedRewards.workspaceId,
            acceptedReferrals.map((r) => r.workspaceId),
          ),
        ),
      )

    return Result.nil()
  }, db)
}
