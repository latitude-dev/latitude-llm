import { describe, expect, it } from 'vitest'

import { RewardType } from '../../browser'
import { createProject, createUser } from '../../tests/factories'
import { createMembership } from '../memberships/create'
import { claimReward } from './claim'
import { BadRequestError } from './../../lib/errors'

describe('claimReward', () => {
  const reference = 'test@example.com'

  it('should successfully claim a reward', async () => {
    const { workspace, user } = await createProject()

    const result = await claimReward({
      workspace,
      user,
      type: RewardType.Referral,
      reference,
    })

    expect(result.ok).toBe(true)
  })

  it('should return an error if the user has been already invited', async () => {
    const { workspace, user } = await createProject()

    await claimReward({ workspace, user, type: RewardType.Referral, reference })

    const result = await claimReward({
      workspace,
      user,
      type: RewardType.Referral,
      reference,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe('User already invited')
  })

  it('should return an error if the user already exists', async () => {
    const { workspace, user: rootUser } = await createProject()
    const user = await createUser({ email: reference })
    await createMembership({ user, workspace })

    const result = await claimReward({
      workspace,
      user: rootUser,
      type: RewardType.Referral,
      reference: user.email,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(BadRequestError)
    expect(result.error?.message).toBe('User already exists')
  })
})
