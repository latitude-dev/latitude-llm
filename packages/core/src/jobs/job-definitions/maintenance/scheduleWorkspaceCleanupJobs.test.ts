import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as factories from '../../../tests/factories'
import { scheduleWorkspaceCleanupJobs } from './scheduleWorkspaceCleanupJobs'
import { SubscriptionPlan, getPlansWithLimitedRetention } from '../../../plans'
import { updateWorkspace } from '../../../services/workspaces'

const mocks = vi.hoisted(() => ({
  queues: vi.fn(),
}))

vi.mock('../../queues', () => ({
  queues: mocks.queues,
}))

describe('scheduleWorkspaceCleanupJobs', () => {
  let mockMaintenanceQueue: {
    add: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    mockMaintenanceQueue = {
      add: vi.fn().mockResolvedValue(undefined),
    }

    mocks.queues.mockResolvedValue({
      maintenanceQueue: mockMaintenanceQueue,
    })
  })

  describe('getPlansWithLimitedRetention', () => {
    it('should not include Enterprise plan', () => {
      const plans = getPlansWithLimitedRetention()
      expect(plans).not.toContain(SubscriptionPlan.EnterpriseV1)
    })

    it('should not include Scale plan', () => {
      const plans = getPlansWithLimitedRetention()
      expect(plans).not.toContain(SubscriptionPlan.ScaleV1)
    })

    it('should include all Hobby plans', () => {
      const plans = getPlansWithLimitedRetention()
      expect(plans).toContain(SubscriptionPlan.HobbyV1)
      expect(plans).toContain(SubscriptionPlan.HobbyV2)
      expect(plans).toContain(SubscriptionPlan.HobbyV3)
    })

    it('should include all Team plans', () => {
      const plans = getPlansWithLimitedRetention()
      expect(plans).toContain(SubscriptionPlan.TeamV1)
      expect(plans).toContain(SubscriptionPlan.TeamV2)
      expect(plans).toContain(SubscriptionPlan.TeamV3)
      expect(plans).toContain(SubscriptionPlan.TeamV4)
    })

    it('should include Pro plan', () => {
      const plans = getPlansWithLimitedRetention()
      expect(plans).toContain(SubscriptionPlan.ProV2)
    })
  })

  describe('workspace filtering', () => {
    it('should enqueue cleanup jobs for workspaces with free plans', async () => {
      const { workspace } = await factories.createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      })

      const mockJob = {
        data: {},
      } as Job<Record<string, never>>

      await scheduleWorkspaceCleanupJobs(mockJob)

      expect(mockMaintenanceQueue.add).toHaveBeenCalledWith(
        'cleanupWorkspaceOldLogsJob',
        { workspaceId: workspace.id },
        { attempts: 3 },
      )
    })

    it('should enqueue cleanup jobs for workspaces with TeamV4 plan', async () => {
      const { workspace: hobbyWorkspace } = await factories.createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      })
      const teamSub = await factories.createSubscription({
        workspaceId: hobbyWorkspace.id,
        plan: SubscriptionPlan.TeamV4,
      })
      const workspace = await updateWorkspace(hobbyWorkspace, {
        currentSubscriptionId: teamSub.id,
      }).then((r) => r.unwrap())

      const mockJob = {
        data: {},
      } as Job<Record<string, never>>

      await scheduleWorkspaceCleanupJobs(mockJob)

      const workspaceIds = mockMaintenanceQueue.add.mock.calls.map(
        (call: unknown[]) => (call[1] as { workspaceId: number }).workspaceId,
      )
      expect(workspaceIds).toContain(workspace.id)
    })

    it('should NOT enqueue cleanup jobs for workspaces with Enterprise plan', async () => {
      const { workspace: hobbyWorkspace } = await factories.createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      })
      const enterpriseSub = await factories.createSubscription({
        workspaceId: hobbyWorkspace.id,
        plan: SubscriptionPlan.EnterpriseV1,
      })
      const workspace = await updateWorkspace(hobbyWorkspace, {
        currentSubscriptionId: enterpriseSub.id,
      }).then((r) => r.unwrap())

      const mockJob = {
        data: {},
      } as Job<Record<string, never>>

      await scheduleWorkspaceCleanupJobs(mockJob)

      const workspaceIds = mockMaintenanceQueue.add.mock.calls.map(
        (call: unknown[]) => (call[1] as { workspaceId: number }).workspaceId,
      )
      expect(workspaceIds).not.toContain(workspace.id)
    })

    it('should NOT enqueue cleanup jobs for workspaces with Scale plan', async () => {
      const { workspace: hobbyWorkspace } = await factories.createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      })
      const scaleSub = await factories.createSubscription({
        workspaceId: hobbyWorkspace.id,
        plan: SubscriptionPlan.ScaleV1,
      })
      const workspace = await updateWorkspace(hobbyWorkspace, {
        currentSubscriptionId: scaleSub.id,
      }).then((r) => r.unwrap())

      const mockJob = {
        data: {},
      } as Job<Record<string, never>>

      await scheduleWorkspaceCleanupJobs(mockJob)

      const workspaceIds = mockMaintenanceQueue.add.mock.calls.map(
        (call: unknown[]) => (call[1] as { workspaceId: number }).workspaceId,
      )
      expect(workspaceIds).not.toContain(workspace.id)
    })

    it('should correctly filter mixed workspaces', async () => {
      const { workspace: hobbyWorkspace } = await factories.createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      })

      const { workspace: teamWorkspaceBase } = await factories.createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      })
      const teamSub = await factories.createSubscription({
        workspaceId: teamWorkspaceBase.id,
        plan: SubscriptionPlan.TeamV4,
      })
      const teamWorkspace = await updateWorkspace(teamWorkspaceBase, {
        currentSubscriptionId: teamSub.id,
      }).then((r) => r.unwrap())

      const { workspace: enterpriseWorkspaceBase } =
        await factories.createWorkspace({
          subscriptionPlan: SubscriptionPlan.HobbyV1,
        })
      const enterpriseSub = await factories.createSubscription({
        workspaceId: enterpriseWorkspaceBase.id,
        plan: SubscriptionPlan.EnterpriseV1,
      })
      const enterpriseWorkspace = await updateWorkspace(
        enterpriseWorkspaceBase,
        {
          currentSubscriptionId: enterpriseSub.id,
        },
      ).then((r) => r.unwrap())

      const { workspace: scaleWorkspaceBase } = await factories.createWorkspace(
        {
          subscriptionPlan: SubscriptionPlan.HobbyV1,
        },
      )
      const scaleSub = await factories.createSubscription({
        workspaceId: scaleWorkspaceBase.id,
        plan: SubscriptionPlan.ScaleV1,
      })
      const scaleWorkspace = await updateWorkspace(scaleWorkspaceBase, {
        currentSubscriptionId: scaleSub.id,
      }).then((r) => r.unwrap())

      const mockJob = {
        data: {},
      } as Job<Record<string, never>>

      await scheduleWorkspaceCleanupJobs(mockJob)

      const workspaceIds = mockMaintenanceQueue.add.mock.calls.map(
        (call: unknown[]) => (call[1] as { workspaceId: number }).workspaceId,
      )

      expect(workspaceIds).toContain(hobbyWorkspace.id)
      expect(workspaceIds).toContain(teamWorkspace.id)
      expect(workspaceIds).not.toContain(enterpriseWorkspace.id)
      expect(workspaceIds).not.toContain(scaleWorkspace.id)
    })

    it('should enqueue jobs with correct parameters', async () => {
      const { workspace } = await factories.createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV2,
      })

      const mockJob = {
        data: {},
      } as Job<Record<string, never>>

      await scheduleWorkspaceCleanupJobs(mockJob)

      const callForWorkspace = mockMaintenanceQueue.add.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as { workspaceId: number }).workspaceId === workspace.id,
      )

      expect(callForWorkspace).toBeDefined()
      expect(callForWorkspace![0]).toBe('cleanupWorkspaceOldLogsJob')
      expect(callForWorkspace![1]).toEqual({ workspaceId: workspace.id })
      expect(callForWorkspace![2]).toEqual({ attempts: 3 })
    })

    it('should handle empty result when no limited retention workspaces exist', async () => {
      const { workspace: baseWorkspace } = await factories.createWorkspace({
        subscriptionPlan: SubscriptionPlan.HobbyV1,
      })
      const enterpriseSub = await factories.createSubscription({
        workspaceId: baseWorkspace.id,
        plan: SubscriptionPlan.EnterpriseV1,
      })
      await updateWorkspace(baseWorkspace, {
        currentSubscriptionId: enterpriseSub.id,
      })

      mockMaintenanceQueue.add.mockClear()

      const mockJob = {
        data: {},
      } as Job<Record<string, never>>

      await scheduleWorkspaceCleanupJobs(mockJob)

      const enterpriseCallsOnly = mockMaintenanceQueue.add.mock.calls.filter(
        (call: unknown[]) =>
          (call[1] as { workspaceId: number }).workspaceId === baseWorkspace.id,
      )
      expect(enterpriseCallsOnly.length).toBe(0)
    })
  })
})
