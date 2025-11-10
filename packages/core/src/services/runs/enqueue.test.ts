import { LogSources } from '@latitude-data/constants'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { Cache } from '../../cache'
import { cache } from '../../cache'
import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { deleteActiveRun } from './active/delete'
import { getRun } from './get'
import { listActiveRuns } from './active/listActive'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { enqueueRun } from './enqueue'

vi.mock('../../jobs/queues')
vi.mock('../../events/publisher')

describe('enqueueRun', () => {
  let redis: Cache
  const mockWorkspace = { id: 1 } as Workspace
  const mockProject = { id: 50 } as Project
  const mockCommit = { uuid: 'commit-uuid' } as Commit
  const mockDocument = { documentUuid: 'doc-uuid' } as DocumentVersion

  const mockQueue = {
    add: vi.fn(),
  }

  const mockJob = {
    id: 'job-123',
  }

  beforeAll(async () => {
    redis = await cache()
    process.setMaxListeners(20)
  })

  beforeEach(async () => {
    vi.clearAllMocks()

    // Flush the entire Redis database to ensure clean state between tests
    // This is safe in test environment as we're using a test-specific Redis instance
    await redis.flushdb()

    vi.mocked(queues).mockResolvedValue({
      runsQueue: mockQueue as any,
    } as any)

    mockQueue.add.mockResolvedValue(mockJob)
    vi.mocked(publisher.publishLater).mockResolvedValue(undefined as any)
  })

  afterAll(async () => {
    // Final cleanup - flush the database
    await redis.flushdb()
  })

  describe('critical: cache entry created before job queued', () => {
    it('creates cache entry BEFORE adding job to queue', async () => {
      const callOrder: string[] = []
      const mockRun = {
        uuid: 'test-uuid',
        queuedAt: new Date(),
      }

      // Mock createActiveRun to track when cache entry is created
      const createSpy = vi
        .spyOn(await import('./active/create'), 'createActiveRun')
        .mockImplementation(async () => {
          callOrder.push('cache-create')
          return { ok: true, value: mockRun } as any
        })

      // Track when job is added to queue
      const originalAdd = mockQueue.add
      mockQueue.add.mockImplementation(async (..._args: any[]) => {
        callOrder.push('job-add')
        return mockJob
      })

      await enqueueRun({
        workspace: mockWorkspace,
        project: mockProject,
        commit: mockCommit,
        document: mockDocument,
      })

      // CRITICAL: Cache entry must be created BEFORE job is added
      expect(callOrder).toEqual(['cache-create', 'job-add'])

      createSpy.mockRestore()
      mockQueue.add = originalAdd
    })

    it('cache entry exists when job starts processing', async () => {
      // This test verifies the real implementation creates cache entries
      // by NOT mocking RunsRepository methods
      const result = await enqueueRun({
        workspace: mockWorkspace,
        project: mockProject,
        commit: mockCommit,
        document: mockDocument,
      })

      expect(result.ok).toBe(true)
      if (!result.ok || !result.value) return

      const run = result.value.run

      // Verify cache entry was created by checking it exists
      const cached = await getRun({
        workspaceId: mockWorkspace.id,
        projectId: mockProject.id,
        runUuid: run.uuid,
      })

      expect(cached.ok).toBe(true)
      if (!cached.ok || !cached.value) return

      expect(cached.value.uuid).toBe(run.uuid)
      expect(cached.value.queuedAt).toBeInstanceOf(Date)

      // Clean up the cache entry we created
      await deleteActiveRun({
        workspaceId: mockWorkspace.id,
        projectId: mockProject.id,
        runUuid: run.uuid,
      })
    })
  })

  describe('cleanup on job creation failure', () => {
    it('deletes cache entry if job creation fails', async () => {
      mockQueue.add.mockResolvedValueOnce(null) // Simulate job creation failure

      const result = await enqueueRun({
        workspace: mockWorkspace,
        project: mockProject,
        commit: mockCommit,
        document: mockDocument,
      })

      expect(result.ok).toBe(false)
      expect(result.error?.message).toContain('Failed to enqueue')

      // Verify cache entry was cleaned up
      const active = await listActiveRuns({
        workspaceId: mockWorkspace.id,
        projectId: mockProject.id,
        page: 1,
        pageSize: 100,
      })

      expect(active.ok).toBe(true)
      if (!active.ok || !active.value) return
      expect(active.value.length).toBe(0)
    })

    it('does not create job if cache creation fails', async () => {
      // Force cache creation to fail
      const createSpy = vi
        .spyOn(await import('./active/create'), 'createActiveRun')
        .mockResolvedValueOnce({
          ok: false,
          error: new Error('Cache error'),
        } as any)

      const result = await enqueueRun({
        workspace: mockWorkspace,
        project: mockProject,
        commit: mockCommit,
        document: mockDocument,
      })

      expect(result.ok).toBe(false)
      expect(mockQueue.add).not.toHaveBeenCalled()

      createSpy.mockRestore()
    })
  })

  describe('concurrent enqueue operations', () => {
    it('handles multiple concurrent enqueue operations correctly', async () => {
      const concurrentCount = 10

      const promises = Array.from({ length: concurrentCount }, (_, _i) =>
        enqueueRun({
          workspace: mockWorkspace,
          project: mockProject,
          commit: mockCommit,
          document: mockDocument,
        }),
      )

      const results = await Promise.all(promises)

      // All should succeed
      const succeeded = results.filter((r) => r.ok)
      expect(succeeded.length).toBe(concurrentCount)

      // All should have unique UUIDs
      const uuids = succeeded.map((r) =>
        r.ok && r.value ? r.value.run.uuid : '',
      )
      expect(new Set(uuids).size).toBe(concurrentCount)

      // All should have cache entries
      const active = await listActiveRuns({
        workspaceId: mockWorkspace.id,
        projectId: mockProject.id,
        page: 1,
        pageSize: 100,
      })

      expect(active.ok).toBe(true)
      if (!active.ok || !active.value) return
      expect(active.value.length).toBe(concurrentCount)

      // Clean up all cache entries
      for (const result of succeeded) {
        if (result.ok && result.value) {
          await deleteActiveRun({
            workspaceId: mockWorkspace.id,
            projectId: mockProject.id,
            runUuid: result.value.run.uuid,
          })
        }
      }
    }, 10000)
  })

  describe('parameters and configuration', () => {
    it('creates job with correct configuration', async () => {
      const customParams = { foo: 'bar' }
      const customIdentifier = 'custom-id'
      const tools = ['tool1', 'tool2']
      const userMessage = 'Hello'

      const result = await enqueueRun({
        workspace: mockWorkspace,
        project: mockProject,
        commit: mockCommit,
        document: mockDocument,
        parameters: customParams,
        customIdentifier,
        tools,
        userMessage,
        source: LogSources.Playground,
      })

      expect(result.ok).toBe(true)
      expect(mockQueue.add).toHaveBeenCalledWith(
        'backgroundRunJob',
        expect.objectContaining({
          workspaceId: mockWorkspace.id,
          projectId: mockProject.id,
          commitUuid: mockCommit.uuid,
          documentUuid: mockDocument.documentUuid,
          parameters: customParams,
          customIdentifier,
          tools,
          userMessage,
          source: LogSources.Playground,
        }),
        expect.objectContaining({
          attempts: 1,
          removeOnComplete: { age: 10 },
          removeOnFail: { age: 10 },
          keepLogs: 0,
        }),
      )
    })

    it('generates UUID if not provided', async () => {
      const result = await enqueueRun({
        workspace: mockWorkspace,
        project: mockProject,
        commit: mockCommit,
        document: mockDocument,
      })

      expect(result.ok).toBe(true)
      if (!result.ok || !result.value) return

      expect(result.value.run.uuid).toBeDefined()
      expect(typeof result.value.run.uuid).toBe('string')
      expect(result.value.run.uuid.length).toBeGreaterThan(0)
    })

    it('uses provided UUID', async () => {
      const customUuid = 'custom-uuid-123'

      const result = await enqueueRun({
        runUuid: customUuid,
        workspace: mockWorkspace,
        project: mockProject,
        commit: mockCommit,
        document: mockDocument,
      })

      expect(result.ok).toBe(true)
      if (!result.ok || !result.value) return

      expect(result.value.run.uuid).toBe(customUuid)
    })

    it('publishes runQueued event', async () => {
      const result = await enqueueRun({
        workspace: mockWorkspace,
        project: mockProject,
        commit: mockCommit,
        document: mockDocument,
      })

      expect(result.ok).toBe(true)
      if (!result.ok || !result.value) return

      const runUuid = result.value.run.uuid

      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'runQueued',
        data: {
          runUuid,
          projectId: mockProject.id,
          workspaceId: mockWorkspace.id,
        },
      })
    })
  })

  describe('race condition prevention', () => {
    it('prevents race where job starts before cache entry exists', async () => {
      let jobProcessingStarted = false
      let cacheEntryExists = false
      const mockRun = {
        uuid: 'test-uuid',
        queuedAt: new Date(),
      }

      const createSpy = vi
        .spyOn(await import('./active/create'), 'createActiveRun')
        .mockImplementation(async () => {
          // Simulate slow cache creation
          await new Promise((resolve) => setTimeout(resolve, 50))
          cacheEntryExists = true
          return { ok: true, value: mockRun } as any
        })

      const originalAdd = mockQueue.add
      mockQueue.add.mockImplementation(async (..._args: any[]) => {
        // Job is queued - workers could pick it up immediately
        jobProcessingStarted = true

        // At this point, cache entry MUST exist
        expect(cacheEntryExists).toBe(true)

        return mockJob
      })

      await enqueueRun({
        workspace: mockWorkspace,
        project: mockProject,
        commit: mockCommit,
        document: mockDocument,
      })

      expect(jobProcessingStarted).toBe(true)
      expect(cacheEntryExists).toBe(true)

      createSpy.mockRestore()
      mockQueue.add = originalAdd
    })
  })
})
