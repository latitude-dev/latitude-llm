import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AIUsageStage,
  LatitudeGoal,
  UserTitle,
} from '@latitude-data/constants/users'
import { SubscriptionPlan } from '../../plans'
import { createInstantlyLeadHandler } from './createInstantlyLead'
import { type UserOnboardingInfoUpdatedEvent } from '../events'

const mockFetch = vi.fn()
const mockUnsafeFindWorkspacesFromUser = vi.fn()
const mockCaptureException = vi.fn()

vi.mock('@latitude-data/env', () => ({
  env: {
    LATITUDE_CLOUD: true,
    LATITUDE_ENTERPRISE_MODE: false,
    INSTANTLY_API_KEY: 'test-instantly-key',
  },
}))

vi.mock('../../data-access/workspaces', () => ({
  unsafelyFindWorkspacesFromUser: (...args: unknown[]) =>
    mockUnsafeFindWorkspacesFromUser(...args),
}))

vi.mock('../../utils/datadogCapture', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}))

function makeEvent(
  overrides: Partial<UserOnboardingInfoUpdatedEvent['data']> = {},
) {
  return {
    type: 'userOnboardingInfoUpdated' as const,
    data: {
      id: 'user-id',
      email: 'user@example.com',
      name: 'Test User',
      confirmedAt: null,
      admin: false,
      lastSuggestionNotifiedAt: null,
      devMode: null,
      title: 'engineer' as UserTitle,
      aiUsageStage: 'live_with_customers' as AIUsageStage,
      latitudeGoal: 'setting_up_evaluations' as LatitudeGoal,
      latitudeGoalOther: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      userEmail: 'user@example.com',
      ...overrides,
    },
  } satisfies UserOnboardingInfoUpdatedEvent
}

function freeWorkspace(id = 1, plan = SubscriptionPlan.HobbyV3) {
  return { id, currentSubscription: { plan } }
}

function paidWorkspace(id = 2, plan = SubscriptionPlan.TeamV4) {
  return { id, currentSubscription: { plan } }
}

describe('createInstantlyLeadHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue({ ok: true })
  })

  describe('happy path', () => {
    it('POSTs to Instantly with correct campaign, email, first_name and skip_if_in_campaign', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({
        userEmail: 'free@test.com',
        name: 'Free First',
      })

      await createInstantlyLeadHandler({ data: event })

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
            campaign: 'ef299a4f-99df-4bea-b5a4-581e09010adc',
            email: 'free@test.com',
            first_name: 'Free',
            skip_if_in_campaign: true,
          }),
        }),
      )
      expect(mockCaptureException).not.toHaveBeenCalled()
    })

    it('sends campaign id from latitude goal when mapped', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({
        userEmail: 'goal@test.com',
        name: 'Goal User',
        latitudeGoal: LatitudeGoal.ImprovingAccuracy,
      })

      await createInstantlyLeadHandler({ data: event })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
      expect(body.campaign).toBe('df56b6eb-a71b-4be9-99d9-75d5b0cb5ce3')
    })

    it('sends single-word name as first_name', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({
        userEmail: 'surname-only@test.com',
        name: 'McGregor',
      })

      await createInstantlyLeadHandler({ data: event })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string)
      expect(body.first_name).toBe('McGregor')
    })
  })

  describe('captureException on silent failures', () => {
    it('captures exception when no workspaces are found', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([])

      const event = makeEvent({ userEmail: 'missing@test.com' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockCaptureException).toHaveBeenCalledOnce()
      expect(mockCaptureException.mock.calls[0]![0].message).toContain(
        'no workspaces found',
      )
    })

    it('captures exception when workspace has no subscription', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([
        { id: 1, currentSubscription: null },
      ])

      const event = makeEvent({ userEmail: 'no-sub@test.com' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockCaptureException).toHaveBeenCalledOnce()
      expect(mockCaptureException.mock.calls[0]![0].message).toContain(
        'no subscription',
      )
    })

    it('captures exception when email is empty after trim', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({ userEmail: '   ' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockCaptureException).toHaveBeenCalledOnce()
      expect(mockCaptureException.mock.calls[0]![0].message).toContain(
        'empty email',
      )
    })
  })

  describe('paid plan filtering', () => {
    it('skips without exception when workspace has a paid plan', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([paidWorkspace()])

      const event = makeEvent({ userEmail: 'paid@test.com' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('skips when any workspace has a paid plan even if first is free', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([
        freeWorkspace(1),
        paidWorkspace(2),
      ])

      const event = makeEvent({ userEmail: 'mixed@test.com' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('proceeds when all workspaces are on free plans', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([
        freeWorkspace(1, SubscriptionPlan.HobbyV2),
        freeWorkspace(2, SubscriptionPlan.HobbyV3),
      ])

      const event = makeEvent({ userEmail: 'all-free@test.com' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
