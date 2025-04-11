import { REWARD_VALUES, RewardType, User, Workspace } from '../../browser'
import { database } from '../../client'
import { unsafelyFindUserByEmail } from '../../data-access'
import { publisher } from '../../events/publisher'
import { ClaimedRewardsRepository } from '../../repositories'
import { claimedRewards } from '../../schema'
import { BadRequestError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export async function claimReward(
  {
    workspace,
    user,
    type,
    reference,
    autoValidated,
  }: {
    workspace: Workspace
    user: User
    type: RewardType
    reference: string
    autoValidated?: boolean
  },
  db = database,
) {
  const claimedRewardsScope = new ClaimedRewardsRepository(workspace.id, db)
  const hasAlreadyClaimed = await claimedRewardsScope.hasClaimed(type)
  if (hasAlreadyClaimed) {
    return Result.error(new BadRequestError('Reward already claimed'))
  }

  if (type === RewardType.Referral) {
    const alreadyReferred = await claimedRewardsScope.exists({
      rewardType: RewardType.Referral,
      reference,
    })

    if (alreadyReferred) {
      return Result.error(new BadRequestError('Referral already solicited'))
    }

    const invited = await unsafelyFindUserByEmail(reference)
    if (invited) {
      return Result.error(new BadRequestError('User already exists'))
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
        isValid: autoValidated ? true : null,
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
