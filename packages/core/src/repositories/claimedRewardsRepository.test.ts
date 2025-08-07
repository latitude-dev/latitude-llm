import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it } from 'vitest'

import { REWARD_VALUES, RewardType, type User, type Workspace } from '../browser'
import { claimReward, updateRewardClaim } from '../services/claimedRewards'
import { ClaimedRewardsRepository } from './claimedRewardsRepository'

describe('ClaimedRewardsRepository', () => {
  let repository: ClaimedRewardsRepository
  let workspace: Workspace
  let user: User

  beforeEach(async (ctx) => {
    const { workspace: createdWorkspace, user: createdUser } = await ctx.factories.createProject()
    workspace = createdWorkspace
    user = createdUser

    repository = new ClaimedRewardsRepository(workspace.id)
  })

  describe('findAllValidOptimistic', () => {
    it('should return all valid optimistic claimed rewards', async () => {
      const claim1 = await claimReward({
        workspace,
        user,
        type: RewardType.Post,
        reference: faker.internet.url(),
      }).then((r) => r.unwrap())

      const claim2 = await claimReward({
        workspace,
        user,
        type: RewardType.GithubIssue,
        reference: faker.internet.url(),
      }).then((r) => r.unwrap())

      await claimReward({
        workspace,
        user,
        type: RewardType.Referral,
        reference: faker.internet.email(),
      }).then((r) => r.unwrap())

      await updateRewardClaim({ claimId: claim1.id, isValid: true })

      const claim4 = await claimReward({
        workspace,
        user,
        type: RewardType.GithubStar,
        reference: faker.internet.userName(),
      }).then((r) => r.unwrap())

      await updateRewardClaim({ claimId: claim4.id, isValid: false })

      const result = await repository.findAllValidOptimistic()

      expect(result.ok).toBe(true)
      const rewards = result.value

      expect(rewards).toHaveLength(2)
      expect(rewards.map((r) => r.id)).toContain(claim1.id)
      expect(rewards.map((r) => r.id)).toContain(claim2.id)
    })
  })

  describe('getExtraRunsOptimistic', () => {
    it('should return the total value of valid optimistic claimed rewards', async () => {
      const claim1 = await claimReward({
        workspace,
        user,
        type: RewardType.Follow,
        reference: faker.internet.userName(),
      }).then((r) => r.unwrap())

      await updateRewardClaim({ claimId: claim1.id, isValid: true })

      await claimReward({
        workspace,
        user,
        type: RewardType.GithubStar,
        reference: faker.internet.userName(),
      }).then((r) => r.unwrap())

      await claimReward({
        workspace,
        user,
        type: RewardType.Referral,
        reference: faker.internet.email(),
      }).then((r) => r.unwrap())

      const claim4 = await claimReward({
        workspace,
        user,
        type: RewardType.Post,
        reference: faker.internet.url(),
      }).then((r) => r.unwrap())
      await updateRewardClaim({ claimId: claim4.id, isValid: false })

      const result = await repository.getExtraRunsOptimistic()

      expect(result.ok).toBe(true)
      const totalValue = result.value

      const expectedValue = REWARD_VALUES[RewardType.Follow] + REWARD_VALUES[RewardType.GithubStar]
      expect(totalValue).toBe(expectedValue)
    })
  })

  describe('hasClaimed', () => {
    it('should return true if there is a claimed reward of the given type', async () => {
      // Create claimed rewards
      const claim1 = await claimReward({
        workspace,
        user,
        type: RewardType.Follow,
        reference: faker.internet.userName(),
      }).then((r) => r.unwrap())
      await updateRewardClaim({ claimId: claim1.id, isValid: true })

      await claimReward({
        workspace,
        user,
        type: RewardType.Referral,
        reference: faker.internet.email(),
      }).then((r) => r.unwrap())

      let result = await repository.hasClaimed(RewardType.Follow)
      expect(result).toBe(true)

      result = await repository.hasClaimed(RewardType.Referral)
      expect(result).toBe(false) // Referral rewards with isValid null are not considered claimed in optimisticFilter

      result = await repository.hasClaimed(RewardType.GithubStar)
      expect(result).toBe(false)
    })
  })

  describe('exists', () => {
    it('should return true if a claimed reward exists with given type and reference', async () => {
      const referralRef = faker.internet.email()
      const followRef1 = faker.internet.userName()
      const followRef2 = faker.internet.userName()

      const claim1 = await claimReward({
        workspace,
        user,
        type: RewardType.Follow,
        reference: followRef1,
      }).then((r) => r.unwrap())

      let result = await repository.exists({
        rewardType: RewardType.Follow,
        reference: followRef1,
      })
      expect(result).toBe(true)

      result = await repository.exists({
        rewardType: RewardType.Referral,
        reference: referralRef,
      })
      expect(result).toBe(false)

      await updateRewardClaim({ claimId: claim1.id, isValid: false })
      result = await repository.exists({
        rewardType: RewardType.Follow,
        reference: followRef1,
      })
      expect(result).toBe(false)

      await claimReward({
        workspace,
        user,
        type: RewardType.Follow,
        reference: followRef2,
      }).then((r) => r.unwrap())

      result = await repository.exists({
        rewardType: RewardType.Follow,
        reference: followRef1,
      })
      expect(result).toBe(false)
    })
  })
})
