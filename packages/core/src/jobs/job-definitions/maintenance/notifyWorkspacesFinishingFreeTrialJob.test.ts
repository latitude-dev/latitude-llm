import { addDays, startOfDay } from 'date-fns'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { database } from '../../../client'
import { publisher } from '../../../events/publisher'
import { SubscriptionPlan } from '../../../plans'
import { subscriptions } from '../../../schema/models/subscriptions'
import { workspaces } from '../../../schema/models/workspaces'
import { createUser, createWorkspace } from '../../../tests/factories'
import type { NotifyWorkspacesFinishingFreeTrialJobData } from './notifyWorkspacesFinishingFreeTrialJob'
import { notifyWorkspacesFinishingFreeTrialJob } from './notifyWorkspacesFinishingFreeTrialJob'
import { LatitudeGoal } from '@latitude-data/constants/users'

vi.mock('@latitude-data/env', () => ({
  env: {
    LATITUDE_CLOUD: true,
    LATITUDE_ENTERPRISE_MODE: false,
    INSTANTLY_API_KEY: 'test-instantly-key',
  },
}))

vi.mock('../../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

vi.mock('../../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

const mockHasAtLeastOneExternalSpan = vi.fn()
vi.mock('../../../queries/clickhouse/spans/hasAtLeastOneExternalSpan', () => ({
  hasAtLeastOneExternalSpan: (...args: unknown[]) =>
    mockHasAtLeastOneExternalSpan(...args),
}))

const mockCreateInstantlyLead = vi.fn()
vi.mock('../../../services/instantly/createLead', () => ({
  createInstantlyLead: (...args: unknown[]) => mockCreateInstantlyLead(...args),
}))

function createMockJob(): Job<NotifyWorkspacesFinishingFreeTrialJobData> {
  return {} as Job<NotifyWorkspacesFinishingFreeTrialJobData>
}

async function setTrialEndsAt(
  subscriptionId: number,
  trialEndsAt: Date | null,
) {
  await database
    .update(subscriptions)
    .set({ trialEndsAt })
    .where(eq(subscriptions.id, subscriptionId))
}

describe('notifyWorkspacesFinishingFreeTrialJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(publisher.publishLater).mockImplementation(() =>
      Promise.resolve(),
    )
    mockHasAtLeastOneExternalSpan.mockResolvedValue(true)
    mockCreateInstantlyLead.mockResolvedValue(undefined)
  })

  describe('publishes workspaceFinishingFreeTrial for workspaces in 6-day window', () => {
    it('publishes event for workspace whose trial ends exactly 6 days from now', async () => {
      const creator = await createUser({
        email: 'test@test.com',
        name: 'Test User',
        latitudeGoal: LatitudeGoal.ObservingTraces,
      })

      const { workspace, userData } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        creator,
      })
      const trialEnd = startOfDay(addDays(new Date(), 6))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(1)
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        {
          email: userData.email,
          name: 'Test User',
          latitudeGoal: LatitudeGoal.ObservingTraces,
        },
        'test-instantly-key',
        true,
      )
      expect(publisher.publishLater).toHaveBeenCalledTimes(1)
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          userEmail: userData.email,
          userGoal: LatitudeGoal.ObservingTraces,
        },
      })
    })

    it('publishes event once per workspace when multiple workspaces in window', async () => {
      const creator1 = await createUser({
        email: 'user1@test.com',
        name: 'User One',
        latitudeGoal: LatitudeGoal.ObservingTraces,
      })
      const creator2 = await createUser({
        email: 'user2@test.com',
        name: 'User Two',
        latitudeGoal: LatitudeGoal.ImprovingAccuracy,
      })
      const { workspace: workspace1, userData: userData1 } =
        await createWorkspace({
          subscriptionPlan: SubscriptionPlan.HobbyV3,
          name: 'Workspace One',
          creator: creator1,
        })
      const { workspace: workspace2, userData: userData2 } =
        await createWorkspace({
          subscriptionPlan: SubscriptionPlan.HobbyV3,
          name: 'Workspace Two',
          creator: creator2,
        })
      const trialEnd = startOfDay(addDays(new Date(), 6))
      await setTrialEndsAt(workspace1.currentSubscriptionId!, trialEnd)
      await setTrialEndsAt(workspace2.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).toHaveBeenCalledTimes(2)
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          userEmail: userData1.email,
          userGoal: LatitudeGoal.ObservingTraces,
        },
      })
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          userEmail: userData2.email,
          userGoal: LatitudeGoal.ImprovingAccuracy,
        },
      })
    })

    it('sends userGoal as latitudeGoalOther when latitudeGoal is empty', async () => {
      const creator = await createUser({
        email: 'test@test.com',
        name: 'Test User',
        latitudeGoalOther: 'My custom goal',
      })

      const { workspace, userData } = await createWorkspace({
        creator,
        subscriptionPlan: SubscriptionPlan.HobbyV3,
      })
      const trialEnd = startOfDay(addDays(new Date(), 6))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        {
          email: userData.email,
          name: 'Test User',
          latitudeGoal: 'My custom goal',
        },
        'test-instantly-key',
        true,
      )
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          userEmail: userData.email,
          userGoal: 'My custom goal',
        },
      })
    })
  })

  describe('publishes event only for ICPs (≥1 external span)', () => {
    it('does not publish event when workspace has no external span', async () => {
      mockHasAtLeastOneExternalSpan.mockResolvedValue(false)
      const creator = await createUser({
        email: 'no-span@test.com',
        name: 'No Span User',
        latitudeGoal: LatitudeGoal.JustExploring,
      })
      const { workspace, userData } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        creator,
      })
      const trialEnd = startOfDay(addDays(new Date(), 6))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).not.toHaveBeenCalled()
      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(1)
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        {
          email: userData.email,
          name: 'No Span User',
          latitudeGoal: LatitudeGoal.JustExploring,
        },
        'test-instantly-key',
        true,
      )
    })

    it('publishes event when workspace has at least one external span', async () => {
      mockHasAtLeastOneExternalSpan.mockResolvedValue(true)
      const creator = await createUser({
        email: 'icp@test.com',
        name: 'ICP User',
        latitudeGoal: LatitudeGoal.ObservingTraces,
      })
      const { workspace, userData } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        creator,
      })
      const trialEnd = startOfDay(addDays(new Date(), 6))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).toHaveBeenCalledTimes(1)
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          userEmail: userData.email,
          userGoal: LatitudeGoal.ObservingTraces,
        },
      })
    })
  })

  describe('creates Instantly lead for every workspace in 6-day window', () => {
    it('calls createInstantlyLead for each workspace in window', async () => {
      mockHasAtLeastOneExternalSpan.mockResolvedValue(false)
      const creator1 = await createUser({
        email: 'user1@test.com',
        name: 'User One',
        latitudeGoal: LatitudeGoal.ManagingPromptVersions,
      })
      const creator2 = await createUser({
        email: 'user2@test.com',
        name: 'User Two',
        latitudeGoal: LatitudeGoal.SettingUpEvaluations,
      })
      const { workspace: workspace1, userData: userData1 } =
        await createWorkspace({
          subscriptionPlan: SubscriptionPlan.HobbyV3,
          name: 'Workspace One',
          creator: creator1,
        })
      const { workspace: workspace2, userData: userData2 } =
        await createWorkspace({
          subscriptionPlan: SubscriptionPlan.HobbyV3,
          name: 'Workspace Two',
          creator: creator2,
        })
      const trialEnd = startOfDay(addDays(new Date(), 6))
      await setTrialEndsAt(workspace1.currentSubscriptionId!, trialEnd)
      await setTrialEndsAt(workspace2.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(2)
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        {
          email: userData1.email,
          name: 'User One',
          latitudeGoal: LatitudeGoal.ManagingPromptVersions,
        },
        'test-instantly-key',
        true,
      )
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        {
          email: userData2.email,
          name: 'User Two',
          latitudeGoal: LatitudeGoal.SettingUpEvaluations,
        },
        'test-instantly-key',
        true,
      )
    })
  })

  describe('does not publish for workspaces outside the exact 6-day window', () => {
    it('does not publish when trial ends 5 days from now', async () => {
      const creator = await createUser({
        latitudeGoal: LatitudeGoal.JustExploring,
      })
      const { workspace } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        creator,
      })
      const trialEnd = startOfDay(addDays(new Date(), 5))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).not.toHaveBeenCalled()
    })

    it('does not publish when trial ends 7 days from now', async () => {
      const creator = await createUser({
        latitudeGoal: LatitudeGoal.JustExploring,
      })
      const { workspace } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        creator,
      })
      const trialEnd = startOfDay(addDays(new Date(), 7))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).not.toHaveBeenCalled()
    })

    it('does not publish when no workspaces have trial in 6-day window', async () => {
      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).not.toHaveBeenCalled()
    })

    it('does not publish when workspace has no creator', async () => {
      const { workspace } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
      })
      await database
        .update(workspaces)
        .set({ creatorId: null })
        .where(eq(workspaces.id, workspace.id))
      const trialEnd = startOfDay(addDays(new Date(), 6))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(mockCreateInstantlyLead).not.toHaveBeenCalled()
      expect(publisher.publishLater).not.toHaveBeenCalled()
    })

    it('does not publish when creator has no latitude goal', async () => {
      const creator = await createUser({
        email: 'no-goal@test.com',
        name: 'No Goal User',
      })
      const { workspace } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        creator,
      })
      const trialEnd = startOfDay(addDays(new Date(), 6))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEnd)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(mockCreateInstantlyLead).not.toHaveBeenCalled()
      expect(publisher.publishLater).not.toHaveBeenCalled()
    })
  })
})
