import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LatitudeGoal } from '@latitude-data/constants/users'
import { SubscriptionPlan } from '../../plans'
import { createInstantlyLead } from './createInstantlyLead'
import { type UserCreatedEvent } from '../events'

const mockFetch = vi.fn()
const mockUnsafeFindWorkspace = vi.fn()

vi.mock('@latitude-data/env', () => ({
  env: {
    LATITUDE_CLOUD: true,
    LATITUDE_ENTERPRISE_MODE: false,
    INSTANTLY_API_KEY: 'test-instantly-key',
  },
}))

vi.mock('../../data-access/workspaces', () => ({
  unsafelyFindWorkspace: (...args: unknown[]) =>
    mockUnsafeFindWorkspace(...args),
}))

vi.mock('../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

function makeUserCreatedEvent(overrides: Partial<UserCreatedEvent['data']> = {}) {
  return {
    type: 'userCreated' as const,
    data: {
      id: 'user-id',
      email: 'user@example.com',
      name: 'Test User',
      confirmedAt: null,
      admin: false,
      lastSuggestionNotifiedAt: null,
      devMode: null,
      title: null,
      aiUsageStage: null,
      latitudeGoal: null,
      latitudeGoalOther: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      workspaceId: 1,
      userEmail: 'user@example.com',
      ...overrides,
    },
  } satisfies UserCreatedEvent
}

describe('createInstantlyLead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue({ ok: true })
  })

  describe('userCreated with free-plan workspace', () => {
    it('POSTs to Instantly with correct campaign, email, first_name and skip_if_in_campaign', async () => {
      mockUnsafeFindWorkspace.mockResolvedValue({
        id: 1,
        currentSubscription: { plan: SubscriptionPlan.HobbyV3 },
      })

      const event = makeUserCreatedEvent({
        userEmail: 'free@test.com',
        name: 'Free First',
      })

      await createInstantlyLead({ data: event })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.instantly.ai/api/v2/leads',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-instantly-key',
          },
          body: JSON.stringify({
            campaign: '61c8f29c-2846-4730-a9b8-4f2770b0b93f',
            email: 'free@test.com',
            first_name: 'Free',
            skip_if_in_campaign: true,
          }),
        }),
      )
    })

    it('sends single-word name (surname only) as first_name', async () => {
      mockUnsafeFindWorkspace.mockResolvedValue({
        id: 1,
        currentSubscription: { plan: SubscriptionPlan.HobbyV2 },
      })

      const event = makeUserCreatedEvent({
        userEmail: 'surname-only@test.com',
        name: 'McGregor',
      })

      await createInstantlyLead({ data: event })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
      expect(body.first_name).toBe('McGregor')
      expect(body.email).toBe('surname-only@test.com')
    })

    it('sends campaign id from latitude goal when mapped', async () => {
      mockUnsafeFindWorkspace.mockResolvedValue({
        id: 1,
        currentSubscription: { plan: SubscriptionPlan.HobbyV3 },
      })

      const event = makeUserCreatedEvent({
        userEmail: 'goal@test.com',
        name: 'Goal User',
        latitudeGoal: LatitudeGoal.ImprovingAccuracy,
      })

      await createInstantlyLead({ data: event })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
      expect(body.campaign).toBe('df56b6eb-a71b-4be9-99d9-75d5b0cb5ce3')
    })
  })

  describe('does not call Instantly when conditions are not met', () => {
    it('does not call fetch when workspace has paid plan', async () => {
      mockUnsafeFindWorkspace.mockResolvedValue({
        id: 1,
        currentSubscription: { plan: SubscriptionPlan.TeamV4 },
      })

      const event = makeUserCreatedEvent({ userEmail: 'paid@test.com' })

      await createInstantlyLead({ data: event })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not call fetch when workspace has no currentSubscription', async () => {
      mockUnsafeFindWorkspace.mockResolvedValue({
        id: 1,
        currentSubscription: null,
      })

      const event = makeUserCreatedEvent({ userEmail: 'no-sub@test.com' })

      await createInstantlyLead({ data: event })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not call fetch when workspace is not found', async () => {
      mockUnsafeFindWorkspace.mockResolvedValue(undefined)

      const event = makeUserCreatedEvent({ userEmail: 'missing@test.com' })

      await createInstantlyLead({ data: event })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not call fetch when email is empty after trim', async () => {
      mockUnsafeFindWorkspace.mockResolvedValue({
        id: 1,
        currentSubscription: { plan: SubscriptionPlan.HobbyV3 },
      })

      const event = makeUserCreatedEvent({ userEmail: '   ' })

      await createInstantlyLead({ data: event })

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

})
