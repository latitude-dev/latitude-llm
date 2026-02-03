import { addDays, startOfDay } from 'date-fns'
import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { database } from '../../../client'
import { publisher } from '../../../events/publisher'
import { SubscriptionPlan } from '../../../plans'
import { subscriptions } from '../../../schema/models/subscriptions'
import { createWorkspace } from '../../../tests/factories'
import type { NotifyWorkspacesFinishingFreeTrialJobData } from './notifyWorkspacesFinishingFreeTrialJob'
import { notifyWorkspacesFinishingFreeTrialJob } from './notifyWorkspacesFinishingFreeTrialJob'

vi.mock('../../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
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
  })

  describe('publishes workspaceFinishingFreeTrial for workspaces in 10-day window', () => {
    it('publishes event for workspace whose trial ends exactly 10 days from now', async () => {
      const { workspace } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
      })
      const trialEndInTenDays = startOfDay(addDays(new Date(), 10))
      await setTrialEndsAt(workspace.currentSubscriptionId!, trialEndInTenDays)

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).toHaveBeenCalledTimes(1)
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        },
      })
    })

    it('publishes event once per workspace when multiple workspaces in window', async () => {
      const { workspace: workspace1 } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        name: 'Workspace One',
      })
      const { workspace: workspace2 } = await createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
        name: 'Workspace Two',
      })
      const trialEndInTenDays = startOfDay(addDays(new Date(), 10))
      await setTrialEndsAt(
        workspace1.currentSubscriptionId!,
        trialEndInTenDays,
      )
      await setTrialEndsAt(
        workspace2.currentSubscriptionId!,
        trialEndInTenDays,
      )

      await notifyWorkspacesFinishingFreeTrialJob(createMockJob())

      expect(publisher.publishLater).toHaveBeenCalledTimes(2)
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          workspaceId: workspace1.id,
          workspaceName: 'Workspace One',
        },
      })
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'workspaceFinishingFreeTrial',
        data: {
          workspaceId: workspace2.id,
          workspaceName: 'Workspace Two',
        },
      })
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
  })
})
