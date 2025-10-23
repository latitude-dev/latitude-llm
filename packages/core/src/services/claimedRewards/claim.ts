import {
  GrantSource,
  QuotaType,
  REWARD_VALUES,
  RewardType,
} from '../../constants'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { unsafelyFindUserByEmail } from '../../data-access/users'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { ClaimedRewardsRepository } from '../../repositories'
import { claimedRewards } from '../../schema/models/claimedRewards'
import { issueGrant } from '../grants/issue'

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
  transaction = new Transaction(),
) {
  const result = await transaction.call(
    async (tx) => {
      const claimedRewardsScope = new ClaimedRewardsRepository(workspace.id, tx)
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
          return Result.error(new BadRequestError('User already invited'))
        }

        const invited = await unsafelyFindUserByEmail(reference, tx)
        if (invited) {
          return Result.error(new BadRequestError('User already exists'))
        }
      }

      const value = REWARD_VALUES[type]
      if (!value) {
        return Result.error(new BadRequestError('Invalid reward type'))
      }

      const newClaimedReward = await tx
        .insert(claimedRewards)
        .values({
          workspaceId: workspace.id,
          userId: user.id,
          rewardType: type,
          reference,
          value,
          isValid: autoValidated ? true : null,
        })
        .returning()
        .then((r) => r[0])

      if (!newClaimedReward) {
        return Result.error(new Error('Error claiming reward'))
      }

      // Referral rewards are not optimistic
      if (type !== RewardType.Referral) {
        const granting = await issueGrant(
          {
            type: QuotaType.Runs,
            amount: value,
            source: GrantSource.Reward,
            referenceId: newClaimedReward.id.toString(),
            workspace: workspace,
          },
          transaction,
        )
        if (granting.error) {
          return Result.error(granting.error)
        }
      }

      return Result.ok(newClaimedReward)
    },
    () => {
      if (type === RewardType.Referral) {
        publisher.publishLater({
          type: 'sendReferralInvitation',
          data: {
            email: reference,
            workspaceId: workspace.id,
            userId: user.id,
          },
        })
      }
    },
  )

  return result
}
