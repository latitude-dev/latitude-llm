import { ACTIVE_RUNS_CACHE_KEY } from '@latitude-data/constants'
import { cache } from '../../../cache'
import { queues } from '../../queues'
import { endRun } from '../../../services/runs/end'
import { Job } from 'bullmq'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { cleanupOrphanedRunsJob } from './cleanupOrphanedRunsJob'
import type { Cache } from '../../../cache'

vi.mock('../../queues')
vi.mock('../../../services/runs/end')

describe('cleanupOrphanedRunsJob', () => {
  let redis: Cache
  const mockRunsQueue = {
    getJob: vi.fn(),
  }

  beforeAll(async () => {
    redis = await cache()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await redis.flushdb()

    vi.mocked(queues).mockResolvedValue({
      runsQueue: mockRunsQueue as any,
    } as any)

    vi.mocked(endRun).mockResolvedValue({ ok: true } as any)
  })

  afterAll(async () => {
    await redis.flushdb()
  })

  it('should clean up orphaned runs (runs without BullMQ jobs older than 1 day)', async () => {
    const workspaceId = 1
    const projectId = 10
    const cacheKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

    // Create orphaned run (old and no BullMQ job)
    await redis.set(
      cacheKey,
      JSON.stringify({
        'orphaned-run-uuid': {
          uuid: 'orphaned-run-uuid',
          queuedAt: twoDaysAgo.toISOString(),
        },
      }),
    )

    // Mock BullMQ to return null (job doesn't exist)
    mockRunsQueue.getJob.mockResolvedValue(null)

    const mockJob = {
      data: { workspaceId, projectId },
    } as Job<{ workspaceId: number; projectId: number }>

    await cleanupOrphanedRunsJob(mockJob)

    // Should call endRun to clean up the orphaned run
    expect(endRun).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      runUuid: 'orphaned-run-uuid',
    })
  })

  it('should not clean up runs that have BullMQ jobs', async () => {
    const workspaceId = 1
    const projectId = 10
    const cacheKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

    // Create run with BullMQ job (should not be cleaned up)
    await redis.set(
      cacheKey,
      JSON.stringify({
        'active-run-uuid': {
          uuid: 'active-run-uuid',
          queuedAt: twoDaysAgo.toISOString(),
        },
      }),
    )

    // Mock BullMQ to return a job (job exists)
    mockRunsQueue.getJob.mockResolvedValue({ id: 'active-run-uuid' } as any)

    const mockJob = {
      data: { workspaceId, projectId },
    } as Job<{ workspaceId: number; projectId: number }>

    await cleanupOrphanedRunsJob(mockJob)

    // Should not call endRun since job exists
    expect(endRun).not.toHaveBeenCalled()
  })

  it('should not clean up runs that are too recent (less than 1 day old)', async () => {
    const workspaceId = 1
    const projectId = 10
    const cacheKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)

    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)

    // Create recent run without BullMQ job (should not be cleaned up)
    await redis.set(
      cacheKey,
      JSON.stringify({
        'recent-run-uuid': {
          uuid: 'recent-run-uuid',
          queuedAt: twelveHoursAgo.toISOString(),
        },
      }),
    )

    // Mock BullMQ to return null (job doesn't exist)
    mockRunsQueue.getJob.mockResolvedValue(null)

    const mockJob = {
      data: { workspaceId, projectId },
    } as Job<{ workspaceId: number; projectId: number }>

    await cleanupOrphanedRunsJob(mockJob)

    // Should not call endRun since run is too recent
    expect(endRun).not.toHaveBeenCalled()
  })

  it('should handle multiple runs correctly', async () => {
    const workspaceId = 1
    const projectId = 10
    const cacheKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)

    // Create mix of orphaned, active, and recent runs
    await redis.set(
      cacheKey,
      JSON.stringify({
        'orphaned-run-1': {
          uuid: 'orphaned-run-1',
          queuedAt: twoDaysAgo.toISOString(),
        },
        'active-run': {
          uuid: 'active-run',
          queuedAt: twoDaysAgo.toISOString(),
        },
        'recent-run': {
          uuid: 'recent-run',
          queuedAt: twelveHoursAgo.toISOString(),
        },
        'orphaned-run-2': {
          uuid: 'orphaned-run-2',
          queuedAt: twoDaysAgo.toISOString(),
        },
      }),
    )

    // Mock BullMQ: active-run has a job, others don't
    mockRunsQueue.getJob.mockImplementation((runUuid: string) => {
      if (runUuid === 'active-run') {
        return Promise.resolve({ id: 'active-run' } as any)
      }
      return Promise.resolve(null)
    })

    // Reset endRun mock before this test
    vi.mocked(endRun).mockClear()
    vi.mocked(endRun).mockResolvedValue({ ok: true } as any)

    const mockJob = {
      data: { workspaceId, projectId },
    } as Job<{ workspaceId: number; projectId: number }>

    await cleanupOrphanedRunsJob(mockJob)

    // Should only clean up the two orphaned runs (not active-run or recent-run)
    expect(endRun).toHaveBeenCalledTimes(2)
    expect(endRun).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      runUuid: 'orphaned-run-1',
    })
    expect(endRun).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      runUuid: 'orphaned-run-2',
    })
  })

  it('should handle empty cache gracefully', async () => {
    const workspaceId = 1
    const projectId = 10

    const mockJob = {
      data: { workspaceId, projectId },
    } as Job<{ workspaceId: number; projectId: number }>

    await cleanupOrphanedRunsJob(mockJob)

    // Should not call endRun or getJob
    expect(endRun).not.toHaveBeenCalled()
    expect(mockRunsQueue.getJob).not.toHaveBeenCalled()
  })

  it('should continue processing other runs if endRun fails', async () => {
    const workspaceId = 1
    const projectId = 10
    const cacheKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

    // Create two orphaned runs
    await redis.set(
      cacheKey,
      JSON.stringify({
        'orphaned-run-1': {
          uuid: 'orphaned-run-1',
          queuedAt: twoDaysAgo.toISOString(),
        },
        'orphaned-run-2': {
          uuid: 'orphaned-run-2',
          queuedAt: twoDaysAgo.toISOString(),
        },
      }),
    )

    // Mock BullMQ to return null (jobs don't exist)
    mockRunsQueue.getJob.mockResolvedValue(null)

    // Mock endRun to fail for first run, succeed for second
    vi.mocked(endRun).mockImplementation(
      async ({ runUuid }: { runUuid: string }) => {
        if (runUuid === 'orphaned-run-1') {
          throw new Error('Failed to end run')
        }
        return { ok: true } as any
      },
    )

    const mockJob = {
      data: { workspaceId, projectId },
    } as Job<{ workspaceId: number; projectId: number }>

    // Should not throw, should continue processing
    await cleanupOrphanedRunsJob(mockJob)

    // Should attempt to clean up both runs
    expect(endRun).toHaveBeenCalledTimes(2)
    expect(endRun).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      runUuid: 'orphaned-run-1',
    })
    expect(endRun).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      runUuid: 'orphaned-run-2',
    })
  })

  it('should handle runs exactly at the threshold boundary', async () => {
    const workspaceId = 1
    const projectId = 10
    const cacheKey = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)

    // Create run exactly 1 day old
    const exactlyOneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    await redis.set(
      cacheKey,
      JSON.stringify({
        'boundary-run': {
          uuid: 'boundary-run',
          queuedAt: exactlyOneDayAgo.toISOString(),
        },
      }),
    )

    // Mock BullMQ to return null (job doesn't exist)
    mockRunsQueue.getJob.mockResolvedValue(null)

    const mockJob = {
      data: { workspaceId, projectId },
    } as Job<{ workspaceId: number; projectId: number }>

    await cleanupOrphanedRunsJob(mockJob)

    // Should clean up run that is exactly at threshold (age >= threshold)
    expect(endRun).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      runUuid: 'boundary-run',
    })
  })
})

