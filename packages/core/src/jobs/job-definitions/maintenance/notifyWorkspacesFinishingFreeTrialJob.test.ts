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

  describe('publishes workspaceFinishingFreeTrial for workspaces in 10-day window', () => {
    it('publishes event for workspace whose trial ends exactly 10 days from now', async () => {
      const creator = await createUser({
        email: 'test@test.com',
        name: 'Test User',
        latitudeGoal: LatitudeGoal.ObservingTraces,
      })

      const { workspace, userData } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        creator,
      })
      const trialEndInTenDays = startOfDay(addDays(new Date(), 10))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEndInTenDays)

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

    it('publishes event once per workspace when multiple workspaces in window', async () => {
      const { workspace: workspace1, userData: userData1 } =
        await createWorkspace({
          subscriptionPlan: SubscriptionPlan.HobbyV3,
          name: 'Workspace One',
        })
      const { workspace: workspace2, userData: userData2 } =
        await createWorkspace({
          subscriptionPlan: SubscriptionPlan.HobbyV3,
          name: 'Workspace Two',
        })
      const trialEndInTenDays = startOfDay(addDays(new Date(), 10))
      await setTrialEndsAt(workspace1.currentSubscriptionId!, trialEndInTenDays)
      await setTrialEndsAt(workspace2.currentSubscriptionId!, trialEndInTenDays)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).toHaveBeenCalledTimes(2)
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          userEmail: userData1.email,
          userGoal: null,
        },
      })
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          userEmail: userData2.email,
          userGoal: null,
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
      const trialEndInTenDays = startOfDay(addDays(new Date(), 10))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEndInTenDays)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

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
        latitudeGoal: LatitudeGoal.JustExploring,
      })
      const { workspace, userData } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        creator,
      })
      const trialEndInTenDays = startOfDay(addDays(new Date(), 10))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEndInTenDays)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).not.toHaveBeenCalled()
      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(1)
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        { email: userData.email },
        'test-instantly-key',
        {
          campaignContext: 'trial_finishing',
          goalForCampaign: LatitudeGoal.JustExploring,
        },
      )
    })

    it('publishes event when workspace has at least one external span', async () => {
      mockHasAtLeastOneExternalSpan.mockResolvedValue(true)
      const creator = await createUser({
        email: 'icp@test.com',
        latitudeGoal: LatitudeGoal.ObservingTraces,
      })
      const { workspace, userData } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        creator,
      })
      const trialEndInTenDays = startOfDay(addDays(new Date(), 10))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEndInTenDays)

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

  describe('creates Instantly lead for every workspace in 10-day window', () => {
    it('calls createInstantlyLead for each workspace in window', async () => {
      mockHasAtLeastOneExternalSpan.mockResolvedValue(false)
      const { workspace: workspace1, userData: userData1 } =
        await createWorkspace({
          subscriptionPlan: SubscriptionPlan.HobbyV3,
          name: 'Workspace One',
        })
      const { workspace: workspace2, userData: userData2 } =
        await createWorkspace({
          subscriptionPlan: SubscriptionPlan.HobbyV3,
          name: 'Workspace Two',
        })
      const trialEndInTenDays = startOfDay(addDays(new Date(), 10))
      await setTrialEndsAt(workspace1.currentSubscriptionId!, trialEndInTenDays)
      await setTrialEndsAt(workspace2.currentSubscriptionId!, trialEndInTenDays)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(mockCreateInstantlyLead).toHaveBeenCalledTimes(2)
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        { email: userData1.email },
        'test-instantly-key',
        {
          campaignContext: 'trial_finishing',
          goalForCampaign: null,
        },
      )
      expect(mockCreateInstantlyLead).toHaveBeenCalledWith(
        { email: userData2.email },
        'test-instantly-key',
        {
          campaignContext: 'trial_finishing',
          goalForCampaign: null,
        },
      )
    })
  })

  describe('does not publish for workspaces outside the exact 10-day window', () => {
    it('does not publish when trial ends 9 days from now', async () => {
      const { workspace } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
      })
      const trialEndInNineDays = startOfDay(addDays(new Date(), 9))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEndInNineDays)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).not.toHaveBeenCalled()
    })

    it('does not publish when trial ends 11 days from now', async () => {
      const { workspace } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
      })
      const trialEndInElevenDays = startOfDay(addDays(new Date(), 11))
      await setTrialEndsAt(
        workspace.currentSubscriptionId!,
        trialEndInElevenDays,
      )

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).not.toHaveBeenCalled()
    })

    it('does not publish when no workspaces have trial in 10-day window', async () => {
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
      const trialEndInTenDays = startOfDay(addDays(new Date(), 10))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEndInTenDays)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).not.toHaveBeenCalled()
    })
  })
})
