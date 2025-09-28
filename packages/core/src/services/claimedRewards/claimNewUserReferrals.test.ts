import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { database } from '../../client'
import { RewardType } from '../../constants'
import { claimedRewards } from '../../schema/models/claimedRewards'
import { claimReward } from './claim'
import { claimNewUserReferrals } from './claimNewUserReferrals'

describe('claimNewUserReferrals', () => {
  it('accepts winner pending referral reward claims for the specified email', async (ctx) => {
    const email = 'test@example.com'
    const { workspace: workspace1, user: user1 } =
      await ctx.factories.createProject()
    const { workspace: workspace2, user: user2 } =
      await ctx.factories.createProject()
    const { workspace: workspace3, user: user3 } =
      await ctx.factories.createProject()

    await claimReward({
      workspace: workspace1,
      user: user1,
      type: RewardType.Referral,
      reference: email,
    })
    await claimReward({
      workspace: workspace2,
      user: user2,
      type: RewardType.Referral,
      reference: email,
    })
    await claimReward({
      workspace: workspace3,
      user: user3,
      type: RewardType.Referral,
      reference: email,
    })

    const pendingClaims = await database.query.claimedRewards.findMany({
      where: and(
        eq(claimedRewards.rewardType, RewardType.Referral),
        eq(claimedRewards.reference, email),
      ),
    })

    expect(pendingClaims.length).toBe(3)
    expect(pendingClaims.every((c) => c.isValid === null)).toBe(true)

    await claimNewUserReferrals({ email })

    const updatedClaims = await database.query.claimedRewards.findMany({
      where: and(
        eq(claimedRewards.rewardType, RewardType.Referral),
        eq(claimedRewards.reference, email),
      ),
    })

    expect(updatedClaims.length).toBe(3)
    expect(updatedClaims.filter((c) => c.isValid === true).length).toBe(1)
    expect(updatedClaims.filter((c) => c.isValid === false).length).toBe(2)
    expect(updatedClaims.filter((c) => c.isValid === null).length).toBe(0)
  })

  it('can only claim 1 referral reward per workspace', async (ctx) => {
    const email1 = 'test1@example.com'
    const email2 = 'test2@example.com'
    const email3 = 'test3@example.com'

    const { workspace, user } = await ctx.factories.createProject()

    await claimReward({
      workspace,
      user,
      type: RewardType.Referral,
      reference: email1,
    })
    await claimReward({
      workspace,
      user,
      type: RewardType.Referral,
      reference: email2,
    })
    await claimReward({
      workspace,
      user,
      type: RewardType.Referral,
      reference: email3,
    })

    const pendingClaims = await database.query.claimedRewards.findMany({
      where: and(
        eq(claimedRewards.rewardType, RewardType.Referral),
        eq(claimedRewards.workspaceId, workspace.id),
      ),
    })

    expect(pendingClaims.length).toBe(3)

    await claimNewUserReferrals({ email: email1 })

    const updatedClaims1 = await database.query.claimedRewards.findMany({
      where: and(
        eq(claimedRewards.rewardType, RewardType.Referral),
        eq(claimedRewards.workspaceId, workspace.id),
      ),
    })

    expect(updatedClaims1.filter((c) => c.isValid === true).length).toBe(1)
    expect(updatedClaims1.filter((c) => c.isValid === false).length).toBe(2)
    expect(updatedClaims1.filter((c) => c.isValid === null).length).toBe(0)

    await claimNewUserReferrals({ email: email2 })

    const updatedClaims2 = await database.query.claimedRewards.findMany({
      where: and(
        eq(claimedRewards.rewardType, RewardType.Referral),
        eq(claimedRewards.workspaceId, workspace.id),
      ),
    })

    expect(updatedClaims2.filter((c) => c.isValid === true).length).toBe(1)
    expect(updatedClaims2.filter((c) => c.isValid === false).length).toBe(2)
    expect(updatedClaims2.filter((c) => c.isValid === null).length).toBe(0)

    const result = await claimReward({
      workspace,
      user,
      type: RewardType.Referral,
      reference: 'test4@example.com',
    })

    expect(result.ok).toBe(false)

    const updatedClaims3 = await database.query.claimedRewards.findMany({
      where: and(
        eq(claimedRewards.rewardType, RewardType.Referral),
        eq(claimedRewards.workspaceId, workspace.id),
      ),
    })

    expect(updatedClaims3.filter((c) => c.isValid === true).length).toBe(1)
    expect(updatedClaims3.filter((c) => c.isValid === false).length).toBe(2)
    expect(updatedClaims3.filter((c) => c.isValid === null).length).toBe(0)
  })
})
