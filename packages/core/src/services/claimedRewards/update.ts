import { eq } from 'drizzle-orm'
import { GrantSource } from '../../constants'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { claimedRewards } from '../../schema/models/claimedRewards'
import { revokeGrants } from '../grants/revoke'

export async function updateRewardClaim(
  {
    claimId,
    isValid,
  }: {
    claimId: number
    isValid: boolean | null
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
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

    if (!isValid) {
      const workspace = await unsafelyFindWorkspace(
        updatedClaimedReward.workspaceId,
        tx,
      )
      if (!workspace) {
        return Result.error(new NotFoundError('Workspace not found'))
      }

      const revoking = await revokeGrants(
        {
          source: GrantSource.Reward,
          referenceId: updatedClaimedReward.id.toString(),
          workspace: workspace,
        },
        transaction,
      )
      if (revoking.error) {
        return Result.error(revoking.error)
      }
    }

    return Result.ok(updatedClaimedReward)
  })
}
