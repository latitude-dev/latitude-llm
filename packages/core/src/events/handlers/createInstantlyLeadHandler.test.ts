import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AIUsageStage,
  LatitudeGoal,
  UserTitle,
} from '@latitude-data/constants/users'
import { SubscriptionPlan } from '../../plans'
import { createInstantlyLeadHandler } from './createInstantlyLeadHandler'
import { type UserOnboardingInfoUpdatedEvent } from '../events'

const mockUnsafeFindWorkspacesFromUser = vi.fn()
const mockCaptureException = vi.fn()
const mockCreateInstantlyLead = vi.fn()

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

vi.mock('../../services/instantly/createLead', () => ({
  createInstantlyLead: (...args: unknown[]) => mockCreateInstantlyLead(...args),
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
    mockCreateInstantlyLead.mockResolvedValue(undefined)
  })

  describe('happy path', () => {
    it('calls createInstantlyLead with correct email, name, and goal', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({
        userEmail: 'free@test.com',
        name: 'Free First',
      })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(1)
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        {
          email: 'free@test.com',
          name: 'Free First',
          latitudeGoal: LatitudeGoal.SettingUpEvaluations,
        },
        'test-instantly-key',
      )
      expect(mockCaptureException).not.toHaveBeenCalled()
    })

    it('passes latitude goal to service when mapped', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({
        userEmail: 'goal@test.com',
        name: 'Goal User',
        latitudeGoal: LatitudeGoal.ImprovingAccuracy,
      })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(1)
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        expect.objectContaining({
          latitudeGoal: LatitudeGoal.ImprovingAccuracy,
        }),
        'test-instantly-key',
      )
    })

    it('passes name to service', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({
        userEmail: 'surname-only@test.com',
        name: 'McGregor',
      })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(1)
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'McGregor' }),
        'test-instantly-key',
      )
    })

    it('passes latitudeGoalOther when latitudeGoal is absent', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({
        userEmail: 'other-goal@test.com',
        latitudeGoal: null,
        latitudeGoalOther: 'My custom goal',
      })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(1)
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        expect.objectContaining({ latitudeGoal: 'My custom goal' }),
        'test-instantly-key',
      )
    })
  })

  describe('captureException on silent failures', () => {
    it('captures exception when no workspaces are found', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([])

      const event = makeEvent({ userEmail: 'missing@test.com' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).not.toHaveBeenCalled()
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

      expect(mockCreateInstantlyLead).not.toHaveBeenCalled()
      expect(mockCaptureException).toHaveBeenCalledOnce()
      expect(mockCaptureException.mock.calls[0]![0].message).toContain(
        'no subscription',
      )
    })

    it('captures exception when email is empty after trim', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({ userEmail: '   ' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).not.toHaveBeenCalled()
      expect(mockCaptureException).toHaveBeenCalledOnce()
      expect(mockCaptureException.mock.calls[0]![0].message).toContain(
        'empty email',
      )
    })

    it('skips silently when latitude goal is missing', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([freeWorkspace()])

      const event = makeEvent({
        userEmail: 'no-goal@test.com',
        latitudeGoal: null,
        latitudeGoalOther: null,
      })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).not.toHaveBeenCalled()
      expect(mockCaptureException).not.toHaveBeenCalled()
    })
  })

  describe('paid plan filtering', () => {
    it('skips without exception when workspace has a paid plan', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([paidWorkspace()])

      const event = makeEvent({ userEmail: 'paid@test.com' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).not.toHaveBeenCalled()
    })

    it('skips when any workspace has a paid plan even if first is free', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([
        freeWorkspace(1),
        paidWorkspace(2),
      ])

      const event = makeEvent({ userEmail: 'mixed@test.com' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).not.toHaveBeenCalled()
    })

    it('proceeds when all workspaces are on free plans', async () => {
      mockUnsafeFindWorkspacesFromUser.mockResolvedValue([
        freeWorkspace(1, SubscriptionPlan.HobbyV2),
        freeWorkspace(2, SubscriptionPlan.HobbyV3),
      ])

      const event = makeEvent({ userEmail: 'all-free@test.com' })

      await createInstantlyLeadHandler({ data: event })

      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(1)
    })
  })
})
