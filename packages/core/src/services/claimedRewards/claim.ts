import { REWARD_VALUES, RewardType, User, Workspace } from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { ForbiddenError, Result, Transaction } from '../../lib'
import { ClaimedRewardsRepository } from '../../repositories'
import { claimedRewards } from '../../schema'

export async function claimReward(
  {
    workspace,
    user,
    type,
    reference,
  }: {
    workspace: Workspace
    user: User
    type: RewardType
    reference: string
  },
  db = database,
) {
  const claimedRewardsScope = new ClaimedRewardsRepository(workspace.id, db)
  const hasAlreadyClaimed = await claimedRewardsScope.hasClaimed(type)
  if (hasAlreadyClaimed) {
    return Result.error(new ForbiddenError('Reward already claimed'))
  }

  if (type === RewardType.Referral) {
    const alreadyReferred = await claimedRewardsScope.exists({
      rewardType: RewardType.Referral,
      reference,
    })

    if (alreadyReferred) {
      return Result.error(new ForbiddenError('Referral already solicited'))
    }
  }

  const result = await Transaction.call(async (tx) => {
    const newClaimedReward = await tx
      .insert(claimedRewards)
      .values({
        workspaceId: workspace.id,
        userId: user.id,
        rewardType: type,
        reference,
        value: REWARD_VALUES[type],
      })
      .returning()
      .then((r) => r[0])

    if (!newClaimedReward) {
      return Result.error(new Error('Error claiming reward'))
    }

    return Result.ok(newClaimedReward)
  }, db)

  if (result.ok && type === RewardType.Referral) {
    publisher.publishLater({
      type: 'sendReferralInvitation',
      data: {
        email: reference,
        workspaceId: workspace.id,
        userId: user.id,
      },
    })
  }

  return result
}
