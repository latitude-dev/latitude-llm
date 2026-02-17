import { Providers } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { ProgressTracker } from '../../jobs/utils/progressTracker'
import type { Commit } from '../../schema/models/types/Commit'
import type { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import type { User } from '../../schema/models/types/User'
import type { Workspace } from '../../schema/models/types/Workspace'
import { createExperiment, createProject, helpers } from '../../tests/factories'
import { WebsocketClient } from '../../websockets/workers'
import { completeExperiment } from './complete'
import { stopExperiment } from './stop'

vi.mock('../../jobs/queues')
vi.mock('../../events/publisher')
vi.mock('../../websockets/workers')
vi.mock('../../jobs/utils/progressTracker')

describe('stopExperiment', () => {
  let commit: Commit
  let document: DocumentVersion
  let user: User
  let workspace: Workspace

  let mockRunsQueue: { getJob: ReturnType<typeof vi.fn> }
  let mockProgressTracker: {
    getProgress: ReturnType<typeof vi.fn>
    getRunUuids: ReturnType<typeof vi.fn>
    cleanup: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const {
      documents: d,
      commit: c,
      user: u,
      workspace: w,
    } = await createProject({
      providers: [
        {
          name: 'openai',
          type: Providers.OpenAI,
        },
      ],
      documents: {
        doc: helpers.createPrompt({ provider: 'openai', model: 'gpt-4o' }),
      },
    })

    document = d[0]!
    commit = c
    user = u
    workspace = w

    mockRunsQueue = {
      getJob: vi.fn(),
    }
    vi.mocked(queues).mockResolvedValue({
      runsQueue: mockRunsQueue,
    } as any)

    mockProgressTracker = {
      getProgress: vi.fn().mockResolvedValue({
        total: 10,
        completed: 5,
        passed: 3,
        failed: 1,
        errors: 1,
        totalScore: 300,
        documentRunsCompleted: 5,
      }),
      getRunUuids: vi.fn().mockResolvedValue([]),
      cleanup: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(ProgressTracker).mockImplementation(
      () => mockProgressTracker as any,
    )

    vi.mocked(publisher.publish).mockResolvedValue(undefined)
    vi.mocked(WebsocketClient.sendEvent).mockResolvedValue(undefined)
  })

  it('returns early if experiment is already finished', async () => {
    const { experiment } = await createExperiment({
      document,
      commit,
      evaluations: [],
      user,
      workspace,
    })

    await completeExperiment({ experiment })

    const finishedExperiment = { ...experiment, finishedAt: new Date() }
    const result = await stopExperiment({
      experiment: finishedExperiment,
      workspaceId: workspace.id,
    })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual(finishedExperiment)
    expect(mockProgressTracker.cleanup).not.toHaveBeenCalled()
  })

  it('marks experiment as finished and cleans up progress tracker', async () => {
    const { experiment } = await createExperiment({
      document,
      commit,
      evaluations: [],
      user,
      workspace,
    })

    const result = await stopExperiment({
      experiment,
      workspaceId: workspace.id,
    })

    expect(result.ok).toBe(true)
    expect(result.value?.finishedAt).toBeInstanceOf(Date)
    expect(mockProgressTracker.getProgress).toHaveBeenCalled()
    expect(mockProgressTracker.getRunUuids).toHaveBeenCalled()
    expect(mockProgressTracker.cleanup).toHaveBeenCalled()
  })

  it('sends websocket event with experiment status', async () => {
    const { experiment } = await createExperiment({
      document,
      commit,
      evaluations: [],
      user,
      workspace,
    })

    await stopExperiment({
      experiment,
      workspaceId: workspace.id,
    })

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith('experimentStatus', {
      workspaceId: workspace.id,
      data: {
        experiment: expect.objectContaining({
          id: experiment.id,
          finishedAt: expect.any(Date),
          results: {
            total: 10,
            completed: 5,
            passed: 3,
            failed: 1,
            errors: 1,
            totalScore: 300,
            documentRunsCompleted: 5,
          },
        }),
      },
    })
  })

  describe('job cancellation', () => {
    it('cancels pending jobs in the queue', async () => {
      const { experiment } = await createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

      const runUuids = ['run-1', 'run-2', 'run-3']
      mockProgressTracker.getRunUuids.mockResolvedValue(runUuids)

      const mockJobs = runUuids.map((uuid) => ({
        id: uuid,
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: vi.fn().mockResolvedValue(undefined),
      }))

      mockRunsQueue.getJob.mockImplementation((uuid: string) => {
        const index = runUuids.indexOf(uuid)
        return Promise.resolve(mockJobs[index])
      })

      await stopExperiment({
        experiment,
        workspaceId: workspace.id,
      })

      for (const uuid of runUuids) {
        expect(mockRunsQueue.getJob).toHaveBeenCalledWith(uuid)
      }

      for (const mockJob of mockJobs) {
        expect(mockJob.getState).toHaveBeenCalled()
        expect(publisher.publish).toHaveBeenCalledWith('cancelJob', {
          jobId: mockJob.id,
        })
        expect(mockJob.remove).toHaveBeenCalled()
      }
    })

    it('publishes cancelJob event for active jobs', async () => {
      const { experiment } = await createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

      mockProgressTracker.getRunUuids.mockResolvedValue(['run-1'])

      const mockJob = {
        id: 'run-1',
        getState: vi.fn().mockResolvedValue('active'),
        remove: vi.fn().mockResolvedValue(undefined),
      }
      mockRunsQueue.getJob.mockResolvedValue(mockJob)

      await stopExperiment({
        experiment,
        workspaceId: workspace.id,
      })

      expect(publisher.publish).toHaveBeenCalledWith('cancelJob', {
        jobId: 'run-1',
      })
    })

    it('does not publish cancelJob for completed jobs', async () => {
      const { experiment } = await createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

      mockProgressTracker.getRunUuids.mockResolvedValue(['run-1'])

      const mockJob = {
        id: 'run-1',
        getState: vi.fn().mockResolvedValue('completed'),
        remove: vi.fn().mockResolvedValue(undefined),
      }
      mockRunsQueue.getJob.mockResolvedValue(mockJob)

      await stopExperiment({
        experiment,
        workspaceId: workspace.id,
      })

      expect(publisher.publish).not.toHaveBeenCalledWith('cancelJob', {
        jobId: 'run-1',
      })
    })

    it('handles jobs that no longer exist in the queue', async () => {
      const { experiment } = await createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

      mockProgressTracker.getRunUuids.mockResolvedValue(['run-1', 'run-2'])

      mockRunsQueue.getJob.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'run-2',
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: vi.fn().mockResolvedValue(undefined),
      })

      const result = await stopExperiment({
        experiment,
        workspaceId: workspace.id,
      })

      expect(result.ok).toBe(true)
      expect(publisher.publish).toHaveBeenCalledWith('cancelJob', {
        jobId: 'run-2',
      })
    })

    it('handles getState errors gracefully', async () => {
      const { experiment } = await createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

      mockProgressTracker.getRunUuids.mockResolvedValue(['run-1'])

      const mockJob = {
        id: 'run-1',
        getState: vi.fn().mockRejectedValue(new Error('Job removed')),
        remove: vi.fn().mockResolvedValue(undefined),
      }
      mockRunsQueue.getJob.mockResolvedValue(mockJob)

      const result = await stopExperiment({
        experiment,
        workspaceId: workspace.id,
      })

      expect(result.ok).toBe(true)
      expect(mockJob.remove).toHaveBeenCalled()
    })

    it('handles job.remove errors gracefully', async () => {
      const { experiment } = await createExperiment({
        document,
        commit,
        evaluations: [],
        user,
        workspace,
      })

      mockProgressTracker.getRunUuids.mockResolvedValue(['run-1'])

      const mockJob = {
        id: 'run-1',
        getState: vi.fn().mockResolvedValue('waiting'),
        remove: vi.fn().mockRejectedValue(new Error('Remove failed')),
      }
      mockRunsQueue.getJob.mockResolvedValue(mockJob)

      const result = await stopExperiment({
        experiment,
        workspaceId: workspace.id,
      })

      expect(result.ok).toBe(true)
    })
  })
})
