import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadLogsJob } from './downloadLogsJob'
import * as factories from '../../../tests/factories'
import { LogSources, Providers } from '../../../constants'
import { diskFactory } from '../../../lib/disk'
import { buildRedisConnection } from '../../../redis'
import { Result } from '../../../lib/Result'
import { findOrCreateExport } from '../../../services/exports/findOrCreate'
import { updateExport } from '../../../services/exports/update'

// Mock dependencies
vi.mock('../../../lib/disk', () => ({
  diskFactory: vi.fn(),
}))

vi.mock('../../../redis', () => ({
  buildRedisConnection: vi.fn(),
}))

vi.mock('../../../services/exports/findOrCreate', () => ({
  findOrCreateExport: vi.fn(),
}))
vi.mock('../../../services/exports/update', () => ({
  updateExport: vi.fn(),
}))

describe('downloadLogsJob', () => {
  let mockJob: Job
  let mockDisk: any
  let mockRedis: any
  let workspace: any
  let document: any
  let commit: any
  let user: any
  let project: any

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks()

    // Create test data
    const projectData = await factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'OpenAI',
        },
      ],
      documents: {
        wat: factories.helpers.createPrompt({
          provider: 'OpenAI',
        }),
      },
    })
    workspace = projectData.workspace
    document = projectData.documents[0]
    commit = projectData.commit
    user = projectData.user
    project = projectData.project

    // Mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      quit: vi.fn(),
    }
    vi.mocked(buildRedisConnection).mockResolvedValue(mockRedis)

    // Mock disk operations
    mockDisk = {
      put: vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(diskFactory).mockReturnValue(mockDisk)

    const now = new Date()
    const mockExport = {
      uuid: '1',
      workspaceId: workspace.id,
      createdAt: now,
      updatedAt: now,
      userId: user.id,
      token: 'test-token',
      fileKey: 'test-file-key',
      readyAt: null,
    }

    // Mock export operations
    vi.mocked(findOrCreateExport).mockResolvedValue(Result.ok(mockExport))
    vi.mocked(updateExport).mockResolvedValue(
      Result.ok({ ...mockExport, readyAt: now }),
    )

    // Create mock job
    mockJob = {
      data: {
        user,
        token: 'test-token',
        workspace,
        selectionMode: 'ALL' as const,
        excludedDocumentLogIds: [],
        document,
        filters: {
          commitIds: [commit.id],
          logSources: [LogSources.API],
        },
      },
      updateProgress: vi.fn(),
    } as any
  })

  it('should process document logs and create CSV file', async () => {
    // Create test document logs
    await factories.createDocumentLog({
      document,
      commit,
      source: LogSources.API,
    })

    // Run the job
    const result = await downloadLogsJob(mockJob)

    // Verify results
    expect(result).toEqual({ totalProcessed: 1 })
    expect(mockDisk.put).toHaveBeenCalled()
    expect(mockJob.updateProgress).toHaveBeenCalled()
    expect(updateExport).toHaveBeenCalled()
  })

  it('should handle empty results', async () => {
    // Run the job with no document logs
    const result = await downloadLogsJob(mockJob)

    // Verify results
    expect(result).toEqual({ totalProcessed: 0 })
    expect(mockDisk.put).not.toHaveBeenCalled()
    expect(mockJob.updateProgress).not.toHaveBeenCalled()
    expect(updateExport).toHaveBeenCalled()
  })

  it('should handle disk write error', async () => {
    // Create test document logs
    await factories.createDocumentLog({
      document,
      commit,
      source: LogSources.API,
    })

    // Mock disk write error
    mockDisk.put.mockResolvedValue({
      error: new Error('Disk write failed'),
    })

    // Run the job and expect error
    await expect(downloadLogsJob(mockJob)).rejects.toThrow(
      'Failed to write to disk: Disk write failed',
    )
  })

  it('should process multiple batches of logs', async () => {
    // Create multiple document logs
    await Promise.all(
      Array.from({ length: 3 }, () =>
        factories.createDocumentLog({
          document,
          commit,
          source: LogSources.API,
        }),
      ),
    )

    // Run the job
    const result = await downloadLogsJob(mockJob)

    // Verify results
    expect(result).toEqual({ totalProcessed: 3 })
    expect(mockDisk.put).toHaveBeenCalled()
    expect(mockJob.updateProgress).toHaveBeenCalled()
    expect(updateExport).toHaveBeenCalled()
  })

  it('should handle filters correctly', async () => {
    // Create document logs with different sources
    await factories.createDocumentLog({
      document,
      commit,
      source: LogSources.API,
    })

    await factories.createDocumentLog({
      document,
      commit,
      source: LogSources.Playground,
    })

    // Run the job with API source filter
    mockJob.data.filters = {
      commitIds: [commit.id],
      logSources: [LogSources.API],
    }

    const result = await downloadLogsJob(mockJob)

    // Verify results
    expect(result).toEqual({ totalProcessed: 1 })
    expect(mockDisk.put).toHaveBeenCalled()
    expect(mockJob.updateProgress).toHaveBeenCalled()
    expect(updateExport).toHaveBeenCalled()
  })

  it('should handle commit filters correctly', async () => {
    // Create a new commit
    const { commit: newCommit } = await factories.createDraft({
      project,
      user,
    })

    // Create document logs in different commits
    await factories.createDocumentLog({
      document,
      commit,
      source: LogSources.API,
    })

    await factories.createDocumentLog({
      document,
      commit: newCommit,
      source: LogSources.API,
    })

    // Run the job with commit filter
    mockJob.data.filters = {
      commitIds: [commit.id],
      logSources: [LogSources.API],
    }

    const result = await downloadLogsJob(mockJob)

    // Verify results
    expect(result).toEqual({ totalProcessed: 1 })
    expect(mockDisk.put).toHaveBeenCalled()
    expect(mockJob.updateProgress).toHaveBeenCalled()
    expect(updateExport).toHaveBeenCalled()
  })

  it('should handle date range filters correctly', async () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Create document logs with different dates
    await factories.createDocumentLog({
      document,
      commit,
      source: LogSources.API,
      createdAt: yesterday,
    })

    await factories.createDocumentLog({
      document,
      commit,
      source: LogSources.API,
      createdAt: now,
    })

    mockJob.data.filters = {
      commitIds: [commit.id],
      logSources: [LogSources.API],
      createdAt: {
        from: yesterday.toISOString(),
        to: now.toISOString(),
      },
    }

    const result = await downloadLogsJob(mockJob)

    // Verify results
    expect(result).toEqual({ totalProcessed: 2 })
    expect(mockDisk.put).toHaveBeenCalled()
    expect(mockJob.updateProgress).toHaveBeenCalled()
    expect(updateExport).toHaveBeenCalled()
  })
})
