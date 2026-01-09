import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import {
  LatitudeGoal,
  AIUsageStage,
  UserTitle,
} from '@latitude-data/constants/users'
import { type User } from '../../schema/models/types/User'
import { createUser } from '../../tests/factories/users'
import { updateUser, isFinalOnboardingStep } from './update'
import { publisher } from '../../events/publisher'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

describe('updateUser', () => {
  let user: User
  let publisherMock: MockInstance

  beforeEach(async () => {
    user = await createUser()
    publisherMock = vi.mocked(publisher.publishLater)
    publisherMock.mockClear()
  })

  it('updates user fields', async () => {
    const result = await updateUser(user, { name: 'New Name' })

    expect(result.ok).toBe(true)
    const updatedUser = result.unwrap()
    expect(updatedUser.name).toBe('New Name')
  })

  it('does not publish event when updating non-onboarding fields', async () => {
    await updateUser(user, { name: 'New Name' })

    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('does not publish event when updating title (not final step)', async () => {
    await updateUser(user, { title: UserTitle.Engineer })

    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('does not publish event when updating aiUsageStage (not final step)', async () => {
    await updateUser(user, { aiUsageStage: AIUsageStage.LiveWithCustomers })

    expect(publisherMock).not.toHaveBeenCalled()
  })

  it('publishes event when updating latitudeGoal (final step)', async () => {
    const result = await updateUser(user, {
      latitudeGoal: LatitudeGoal.ObservingTraces,
    })

    expect(result.ok).toBe(true)
    const updatedUser = result.unwrap()

    expect(publisherMock).toHaveBeenCalledOnce()
    expect(publisherMock).toHaveBeenCalledWith({
      type: 'userOnboardingInfoUpdated',
      data: {
        ...updatedUser,
        userEmail: updatedUser.email,
      },
    })
  })

  it('publishes event when updating latitudeGoalOther (final step)', async () => {
    const result = await updateUser(user, {
      latitudeGoal: LatitudeGoal.Other,
      latitudeGoalOther: 'Custom goal description',
    })

    expect(result.ok).toBe(true)
    const updatedUser = result.unwrap()

    expect(publisherMock).toHaveBeenCalledOnce()
    expect(publisherMock).toHaveBeenCalledWith({
      type: 'userOnboardingInfoUpdated',
      data: {
        ...updatedUser,
        userEmail: updatedUser.email,
      },
    })
  })
})

describe('isFinalOnboardingStep', () => {
  it('returns false for empty values', () => {
    expect(isFinalOnboardingStep({})).toBe(false)
  })

  it('returns false for title update', () => {
    expect(isFinalOnboardingStep({ title: UserTitle.Engineer })).toBe(false)
  })

  it('returns false for aiUsageStage update', () => {
    expect(
      isFinalOnboardingStep({ aiUsageStage: AIUsageStage.LiveWithCustomers }),
    ).toBe(false)
  })

  it('returns true for latitudeGoal update', () => {
    expect(
      isFinalOnboardingStep({ latitudeGoal: LatitudeGoal.ObservingTraces }),
    ).toBe(true)
  })

  it('returns true for latitudeGoalOther update', () => {
    expect(isFinalOnboardingStep({ latitudeGoalOther: 'Custom goal' })).toBe(
      true,
    )
  })

  it('returns true when both latitudeGoal and latitudeGoalOther are present', () => {
    expect(
      isFinalOnboardingStep({
        latitudeGoal: LatitudeGoal.Other,
        latitudeGoalOther: 'Custom goal',
      }),
    ).toBe(true)
  })
})
