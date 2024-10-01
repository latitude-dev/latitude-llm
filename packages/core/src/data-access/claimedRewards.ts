import { and, desc, eq, getTableColumns, isNull, not } from 'drizzle-orm'

import { ClaimedRewardWithUserInfo, RewardType } from '../browser'
import { database } from '../client'
import { Ok, Result } from '../lib/Result'
import { claimedRewards, users, workspaces } from '../schema'

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
