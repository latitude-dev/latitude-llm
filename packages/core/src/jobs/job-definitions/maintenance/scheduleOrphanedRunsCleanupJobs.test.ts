import { ACTIVE_RUNS_CACHE_KEY } from '@latitude-data/constants'
import { cache } from '../../../cache'
import { queues } from '../../queues'
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
import { scheduleOrphanedRunsCleanupJobs } from './scheduleOrphanedRunsCleanupJobs'
import type { Cache } from '../../../cache'

vi.mock('../../queues')

describe('scheduleOrphanedRunsCleanupJobs', () => {
  let redis: Cache
  const mockMaintenanceQueue = {
    add: vi.fn(),
  }

  beforeAll(async () => {
    redis = await cache()
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await redis.flushdb()

    vi.mocked(queues).mockResolvedValue({
      maintenanceQueue: mockMaintenanceQueue as any,
    } as any)

    mockMaintenanceQueue.add.mockResolvedValue({ id: 'job-123' } as any)
  })

  afterAll(async () => {
    await redis.flushdb()
  })

  it('should scan Redis and enqueue cleanup jobs for each workspace/project', async () => {
    // Create active run cache entries for different workspaces/projects
    // The cache client automatically adds the 'latitude:' prefix
    const workspace1Project1 = ACTIVE_RUNS_CACHE_KEY(1, 10)
    const workspace1Project2 = ACTIVE_RUNS_CACHE_KEY(1, 20)
    const workspace2Project1 = ACTIVE_RUNS_CACHE_KEY(2, 10)

    await redis.set(
      workspace1Project1,
      JSON.stringify({
        'run-uuid-1': {
          uuid: 'run-uuid-1',
          queuedAt: new Date().toISOString(),
        },
      }),
    )

    await redis.set(
      workspace1Project2,
      JSON.stringify({
        'run-uuid-2': {
          uuid: 'run-uuid-2',
          queuedAt: new Date().toISOString(),
        },
      }),
    )

    await redis.set(
      workspace2Project1,
      JSON.stringify({
        'run-uuid-3': {
          uuid: 'run-uuid-3',
          queuedAt: new Date().toISOString(),
        },
      }),
    )

    const mockJob = {
      data: {},
    } as Job

    await scheduleOrphanedRunsCleanupJobs(mockJob)

    // Should enqueue 3 cleanup jobs (one for each workspace/project combination)
    expect(mockMaintenanceQueue.add).toHaveBeenCalledTimes(3)

    // Verify correct workspace/project combinations were enqueued
    expect(mockMaintenanceQueue.add).toHaveBeenCalledWith(
      'cleanupOrphanedRunsJob',
      { workspaceId: 1, projectId: 10 },
      { attempts: 3 },
    )
    expect(mockMaintenanceQueue.add).toHaveBeenCalledWith(
      'cleanupOrphanedRunsJob',
      { workspaceId: 1, projectId: 20 },
      { attempts: 3 },
    )
    expect(mockMaintenanceQueue.add).toHaveBeenCalledWith(
      'cleanupOrphanedRunsJob',
      { workspaceId: 2, projectId: 10 },
      { attempts: 3 },
    )
  })

  it('should not enqueue duplicate jobs for the same workspace/project', async () => {
    // Create multiple cache entries that might be scanned multiple times
    const workspace1Project1 = ACTIVE_RUNS_CACHE_KEY(1, 10)

    await redis.set(
      workspace1Project1,
      JSON.stringify({
        'run-uuid-1': {
          uuid: 'run-uuid-1',
          queuedAt: new Date().toISOString(),
        },
        'run-uuid-2': {
          uuid: 'run-uuid-2',
          queuedAt: new Date().toISOString(),
        },
      }),
    )

    const mockJob = {
      data: {},
    } as Job

    await scheduleOrphanedRunsCleanupJobs(mockJob)

    // Should only enqueue one job despite multiple runs in the cache
    expect(mockMaintenanceQueue.add).toHaveBeenCalledTimes(1)
    expect(mockMaintenanceQueue.add).toHaveBeenCalledWith(
      'cleanupOrphanedRunsJob',
      { workspaceId: 1, projectId: 10 },
      { attempts: 3 },
    )
  })

  it('should handle empty Redis (no active runs)', async () => {
    const mockJob = {
      data: {},
    } as Job

    await scheduleOrphanedRunsCleanupJobs(mockJob)

    // Should not enqueue any jobs
    expect(mockMaintenanceQueue.add).not.toHaveBeenCalled()
  })

  it('should skip invalid cache keys that do not match the pattern', async () => {
    // Create a key that doesn't match the pattern
    await redis.set('invalid:key:pattern', 'some-data')

    const mockJob = {
      data: {},
    } as Job

    await scheduleOrphanedRunsCleanupJobs(mockJob)

    // Should not enqueue any jobs for invalid keys
    expect(mockMaintenanceQueue.add).not.toHaveBeenCalled()
  })

  it('should handle keys with Redis prefix correctly', async () => {
    // The cache client adds a prefix, but SCAN returns keys with prefix
    // The job should handle this correctly
    const workspace1Project1 = ACTIVE_RUNS_CACHE_KEY(1, 10)

    await redis.set(
      workspace1Project1,
      JSON.stringify({
        'run-uuid-1': {
          uuid: 'run-uuid-1',
          queuedAt: new Date().toISOString(),
        },
      }),
    )

    const mockJob = {
      data: {},
    } as Job

    await scheduleOrphanedRunsCleanupJobs(mockJob)

    // Should still enqueue the job correctly
    expect(mockMaintenanceQueue.add).toHaveBeenCalledTimes(1)
    expect(mockMaintenanceQueue.add).toHaveBeenCalledWith(
      'cleanupOrphanedRunsJob',
      { workspaceId: 1, projectId: 10 },
      { attempts: 3 },
    )
  })
})

