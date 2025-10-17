import { claimedRewards } from '../schema/models/claimedRewards'
import { users } from '../schema/models/users'
import { workspaces } from '../schema/models/workspaces'
import { and, desc, eq, getTableColumns, isNull, not } from 'drizzle-orm'

import { ClaimedRewardWithUserInfo } from '../schema/models/types/ClaimedReward'
import { RewardType } from '../constants'
import { database } from '../client'
import { Ok, Result } from '../lib/Result'

export async function findAllRewardClaimsPendingToValidate(
  tx = database,
): Promise<Ok<ClaimedRewardWithUserInfo[]>> {
  const result = await tx
    .select({
      ...getTableColumns(claimedRewards),
      userName: users.name,
      userEmail: users.email,
      workspaceName: workspaces.name,
    })
    .from(claimedRewards)
    .leftJoin(users, eq(users.id, claimedRewards.userId))
    .leftJoin(workspaces, eq(workspaces.id, claimedRewards.workspaceId))
    .where(
      and(
        isNull(claimedRewards.isValid),
        not(eq(claimedRewards.rewardType, RewardType.Referral)), // Referral rewards are not manually validated
      ),
    )
    .orderBy(desc(claimedRewards.createdAt))

  return Result.ok(result)
}
