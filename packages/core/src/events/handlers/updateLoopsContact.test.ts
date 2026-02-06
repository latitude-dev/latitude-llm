import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AIUsageStage,
  LatitudeGoal,
  UserTitle,
} from '@latitude-data/constants/users'

import { updateLoopsContact } from './updateLoopsContact'
import { type UserOnboardingInfoUpdatedEvent } from '../events'

const updateContactMock = vi.fn()

vi.mock('@latitude-data/env', () => ({
  env: {
    LOOPS_API_KEY: 'test-api-key',
  },
}))

vi.mock('loops', () => ({
  LoopsClient: vi.fn().mockImplementation(() => ({
    updateContact: updateContactMock,
  })),
}))

describe('updateLoopsContact', () => {
  beforeEach(() => {
    updateContactMock.mockResolvedValue({ success: true })
    updateContactMock.mockClear()
  })

  it('truncates oversized fields before updating contact', async () => {
    const longValue = 'a'.repeat(300)
    const event = {
      type: 'userOnboardingInfoUpdated',
      data: {
        id: 'user-id',
        name: 'Test User',
        email: 'user@example.com',
        confirmedAt: null,
        admin: false,
        lastSuggestionNotifiedAt: null,
        devMode: null,
        title: UserTitle.Engineer,
        aiUsageStage: AIUsageStage.LiveWithCustomers,
        latitudeGoal: LatitudeGoal.Other,
        latitudeGoalOther: longValue,
        createdAt: new Date(),
        updatedAt: new Date(),
        userEmail: 'user@example.com',
      },
    } as UserOnboardingInfoUpdatedEvent

    await updateLoopsContact({ data: event })

    const expectedValue = longValue.slice(0, 255)

    expect(updateContactMock).toHaveBeenCalledWith('user@example.com', {
      jobTitle: UserTitle.Engineer,
      aiUsageStage: AIUsageStage.LiveWithCustomers,
      latitudeGoal: expectedValue,
    })
  })
})
