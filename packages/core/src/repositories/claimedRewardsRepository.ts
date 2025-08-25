import { and, eq, getTableColumns, isNull, not, or, sum } from 'drizzle-orm'

import { type ClaimedReward, RewardType } from '../browser'
import { Result } from '../lib/Result'
import { claimedRewards } from '../schema/models/claimedRewards'
import RepositoryLegacy from './repository'

const tt = getTableColumns(claimedRewards)

export class ClaimedRewardsRepository extends RepositoryLegacy<typeof tt, ClaimedReward> {
  get scope() {
    return this.db
      .select(tt)
      .from(claimedRewards)
      .where(eq(claimedRewards.workspaceId, this.workspaceId))
      .as('claimed_rewards_scope')
  }

  get optimisticFilter() {
    return or(
      eq(this.scope.isValid, true),
      and(
        isNull(this.scope.isValid),
        not(eq(this.scope.rewardType, RewardType.Referral)), // Referral rewards are not optimistic
      ),
    )
  }

  async findAllValidOptimistic() {
    const result = await this.db.select().from(this.scope).where(this.optimisticFilter)

    return Result.ok(result)
  }

  async getExtraRunsOptimistic() {
    const result = await this.db
      .select({
        total: sum(this.scope.value).mapWith(Number).as('total'),
      })
      .from(this.scope)
      .where(this.optimisticFilter)

    return Result.ok(result[0]?.total ?? 0)
  }

  async hasClaimed(rewardType: RewardType) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(and(this.optimisticFilter, eq(this.scope.rewardType, rewardType)))

    return result.length > 0
  }

  async exists({ rewardType, reference }: { rewardType: RewardType; reference: string }) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(
        and(
          or(isNull(this.scope.isValid), eq(this.scope.isValid, true)),
          eq(this.scope.rewardType, rewardType),
          eq(this.scope.reference, reference),
        ),
      )

    return result.length > 0
  }
}
