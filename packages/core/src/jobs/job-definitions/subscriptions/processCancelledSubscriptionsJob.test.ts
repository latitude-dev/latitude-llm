import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { subDays, addDays } from 'date-fns'
import { eq } from 'drizzle-orm'
import { database } from '../../../client'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { SubscriptionPlan } from '../../../plans'
import { subscriptions } from '../../../schema/models/subscriptions'
import { createWorkspace as createWorkspaceFactory } from '../../../tests/factories'
import { publisher } from '../../../events/publisher'
import * as usersQueries from '../../../queries/users/findFirstInWorkspace'
import { User } from '../../../schema/models/types/User'
import type { ProcessCancelledSubscriptionsJobData } from './processCancelledSubscriptionsJob'
import { processCancelledSubscriptionsJob } from './processCancelledSubscriptionsJob'

vi.mock('../../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
  changePlan: vi.fn(async () => {
    const actualModule = await vi.importActual('')
    return actualModule
  }),
}))

function createMockJob(): Job<ProcessCancelledSubscriptionsJobData> {
  return {} as Job<ProcessCancelledSubscriptionsJobData>
}

async function setCancelledAt(
  subscriptionId: number,
  cancelledAt: Date | null,
) {
  await database
    .update(subscriptions)
    .set({ cancelledAt })
    .where(eq(subscriptions.id, subscriptionId))
}

describe('processCancelledSubscriptionsJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(publisher.publishLater).mockImplementation(() =>
      Promise.resolve(),
    )
    vi.spyOn(usersQueries, 'findFirstUserInWorkspace').mockResolvedValue({
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
    } as User)
  })

  describe('processes cancelled subscriptions', () => {
    it('downgrades workspace with cancelledAt in the past to HobbyV3', async () => {
      const { workspace } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.TeamV4,
      })

      await setCancelledAt(
        workspace.currentSubscriptionId!,
        subDays(new Date(), 1),
      )

      await processCancelledSubscriptionsJob(createMockJob())

      const updatedWorkspace = await unsafelyFindWorkspace(workspace.id)

      expect(updatedWorkspace!.currentSubscription.plan).toBe(
        SubscriptionPlan.HobbyV3,
      )
    })

    it('creates subscription with trial already expired', async () => {
      const { workspace } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.TeamV4,
      })

      await setCancelledAt(
        workspace.currentSubscriptionId!,
        subDays(new Date(), 1),
      )

      await processCancelledSubscriptionsJob(createMockJob())

      const updatedWorkspace = await unsafelyFindWorkspace(workspace.id)
      const currentSubscription = updatedWorkspace!.currentSubscription

      expect(currentSubscription.trialEndsAt).not.toBeNull()
      expect(currentSubscription.trialEndsAt!.getTime()).toBeLessThan(
        Date.now(),
      )
    })

    it('publishes subscriptionUpdated event after downgrade', async () => {
      const { workspace } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.TeamV4,
      })

      await setCancelledAt(
        workspace.currentSubscriptionId!,
        subDays(new Date(), 1),
      )

      await processCancelledSubscriptionsJob(createMockJob())

      await vi.waitFor(() => {
        expect(publisher.publishLater).toHaveBeenCalledWith({
          type: 'subscriptionUpdated',
          data: expect.objectContaining({
            workspace: expect.objectContaining({ id: workspace.id }),
            subscription: expect.objectContaining({
              plan: SubscriptionPlan.HobbyV3,
            }),
            userEmail: 'mock@example.com',
          }),
        })
      })
    })

    it('processes multiple cancelled subscriptions', async () => {
      const { workspace: workspace1 } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.TeamV4,
      })
      const { workspace: workspace2 } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.TeamV3,
      })

      await setCancelledAt(
        workspace1.currentSubscriptionId!,
        subDays(new Date(), 2),
      )
      await setCancelledAt(
        workspace2.currentSubscriptionId!,
        subDays(new Date(), 1),
      )

      await processCancelledSubscriptionsJob(createMockJob())

      const updatedWorkspace1 = await unsafelyFindWorkspace(workspace1.id)
      const updatedWorkspace2 = await unsafelyFindWorkspace(workspace2.id)

      expect(updatedWorkspace1!.currentSubscription.plan).toBe(
        SubscriptionPlan.HobbyV3,
      )
      expect(updatedWorkspace2!.currentSubscription.plan).toBe(
        SubscriptionPlan.HobbyV3,
      )
    })
  })

  describe('ignores subscriptions that should not be processed', () => {
    it('does not process subscriptions with cancelledAt in the future', async () => {
      const { workspace } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.TeamV4,
      })
      const originalSubscriptionId = workspace.currentSubscriptionId

      await setCancelledAt(originalSubscriptionId!, addDays(new Date(), 7))
      await processCancelledSubscriptionsJob(createMockJob())

      const updatedWorkspace = await unsafelyFindWorkspace(workspace.id)

      expect(updatedWorkspace!.currentSubscriptionId).toBe(
        originalSubscriptionId,
      )
      expect(updatedWorkspace!.currentSubscription.plan).toBe(
        SubscriptionPlan.TeamV4,
      )
    })

    it('does not process subscriptions without cancelledAt', async () => {
      const { workspace } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.TeamV4,
      })
      const originalSubscriptionId = workspace.currentSubscriptionId

      await processCancelledSubscriptionsJob(createMockJob())

      const updatedWorkspace = await unsafelyFindWorkspace(workspace.id)

      expect(updatedWorkspace!.currentSubscriptionId).toBe(
        originalSubscriptionId,
      )
      expect(updatedWorkspace!.currentSubscription.plan).toBe(
        SubscriptionPlan.TeamV4,
      )
    })

    it('still processes HobbyV3 subscriptions that were cancelled', async () => {
      const { workspace } = await createWorkspaceFactory({
        subscriptionPlan: SubscriptionPlan.HobbyV3,
      })
      const originalSubscriptionId = workspace.currentSubscriptionId

      await setCancelledAt(originalSubscriptionId!, subDays(new Date(), 1))

      await processCancelledSubscriptionsJob(createMockJob())

      const updatedWorkspace = await unsafelyFindWorkspace(workspace.id)

      expect(updatedWorkspace!.currentSubscriptionId).not.toBe(
        originalSubscriptionId,
      )
      expect(updatedWorkspace!.currentSubscription.plan).toBe(
        SubscriptionPlan.HobbyV3,
      )
    })
  })
})
