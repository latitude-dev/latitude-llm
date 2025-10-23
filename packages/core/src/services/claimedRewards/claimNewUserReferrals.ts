import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { GrantSource, QuotaType, RewardType } from '../../constants'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { claimedRewards } from '../../schema/models/claimedRewards'
import { issueGrant } from '../grants/issue'

export async function claimNewUserReferrals(
  {
    email,
  }: {
    email: string
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    // Find all candidate referrals for claiming workspaces
    const candidates = await tx
      .select({
        claimId: claimedRewards.id,
        workspaceId: claimedRewards.workspaceId,
        reward: claimedRewards.value,
      })
      .from(claimedRewards)
      .where(
        and(
          eq(claimedRewards.rewardType, RewardType.Referral),
          eq(claimedRewards.reference, email),
          isNull(claimedRewards.isValid),
        ),
      )
      .orderBy(asc(claimedRewards.createdAt), asc(claimedRewards.id))
    if (candidates.length < 1) {
      return Result.nil()
    }

    const winner = candidates[0]
    const losers = candidates.slice(1)

    // Reject pending referral rewards for winning workspace
    // TODO(rewards): allow 2 referrals per month
    await tx
      .update(claimedRewards)
      .set({ isValid: false })
      .where(
        and(
          eq(claimedRewards.workspaceId, winner.workspaceId),
          eq(claimedRewards.rewardType, RewardType.Referral),
        ),
      )

    // Accept new user referral for the first winning claim
    await tx
      .update(claimedRewards)
      .set({ isValid: true })
      .where(eq(claimedRewards.id, winner.claimId))

    if (losers.length > 0) {
      // Reject new user pending referral rewards for loser claims
      await tx
        .update(claimedRewards)
        .set({ isValid: false })
        .where(
          inArray(
            claimedRewards.id,
            losers.map((c) => c.claimId),
          ),
        )
    }

    // Grant reward to winning workspace
    const workspace = await unsafelyFindWorkspace(winner.workspaceId, tx)
    if (!workspace) {
      return Result.error(new NotFoundError('Workspace not found'))
    }

    const granting = await issueGrant(
      {
        type: QuotaType.Runs,
        amount: winner.reward,
        source: GrantSource.Reward,
        referenceId: winner.claimId.toString(),
        workspace: workspace,
      },
      transaction,
    )
    if (granting.error) {
      return Result.error(granting.error)
    }

    return Result.nil()
  })
}
