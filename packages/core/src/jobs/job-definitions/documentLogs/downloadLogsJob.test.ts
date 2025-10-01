import { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LogSources, Providers } from '../../../constants'
import { diskFactory } from '../../../lib/disk'
import { Result } from '../../../lib/Result'
import { buildRedisConnection } from '../../../redis'
import { findOrCreateExport } from '../../../services/exports/findOrCreate'
import { updateExport } from '../../../services/exports/update'
import { hydrateProviderLog } from '../../../services/providerLogs/hydrate'
import * as factories from '../../../tests/factories'
import { downloadLogsJob } from './downloadLogsJob'

// Mock dependencies
vi.mock('../../../lib/disk', () => ({
  diskFactory: vi.fn(),
}))

vi.mock(import('../../../redis'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildRedisConnection: vi.fn(),
  }
})

vi.mock('../../../services/exports/findOrCreate', () => ({
  findOrCreateExport: vi.fn(),
}))
vi.mock('../../../services/exports/update', () => ({
  updateExport: vi.fn(),
}))

vi.mock('../../../services/providerLogs/hydrate', () => ({
  hydrateProviderLog: vi.fn(),
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
      putStream: vi.fn().mockResolvedValue(Result.nil()),
      exists: vi.fn().mockResolvedValue(false),
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

    // Mock hydrateProviderLog to return a basic hydrated log
    const mockHydratedLog = {
      id: 1,
      workspaceId: workspace.id,
      uuid: 'test-uuid',
      documentLogUuid: 'doc-log-uuid',
      providerId: 1,
      model: 'gpt-3.5-turbo',
      finishReason: 'stop',
      config: { model: 'gpt-3.5-turbo' },
      messages: [{ role: 'user', content: 'Hello' }],
      output: { text: 'Hello, how can I help you?' },
      responseObject: { content: 'Hello, how can I help you?' },
      responseText: 'Hello, how can I help you?',
      responseReasoning: 'Generated response based on input',
      toolCalls: [],
      tokens: 150,
      costInMillicents: 500,
      duration: 1000,
      source: LogSources.API,
      apiKeyId: 1,
      generatedAt: new Date(),
      fileKey: 'test-file-key',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    vi.mocked(hydrateProviderLog).mockResolvedValue(
      Result.ok(mockHydratedLog as any),
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
    expect(mockDisk.putStream).toHaveBeenCalled()
    expect(mockJob.updateProgress).toHaveBeenCalled()
    expect(updateExport).toHaveBeenCalled()
  })

  it('should handle empty results', async () => {
    // Run the job with no document logs
    const result = await downloadLogsJob(mockJob)

    // Verify results
    expect(mockDisk.putStream).toHaveBeenCalled()
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
    mockDisk.putStream.mockResolvedValue(
      Result.error(new Error('Disk write failed')),
    )

    // Run the job and expect error
    await expect(downloadLogsJob(mockJob)).rejects.toThrow('Disk write failed')
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
    expect(mockDisk.putStream).toHaveBeenCalled()
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
    expect(mockDisk.putStream).toHaveBeenCalled()
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
    expect(mockDisk.putStream).toHaveBeenCalled()
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
    expect(mockDisk.putStream).toHaveBeenCalled()
    expect(mockJob.updateProgress).toHaveBeenCalled()
    expect(updateExport).toHaveBeenCalled()
  })

  it('should return complete row when provider log is hydrated', async () => {
    // Create test document log
    await factories.createDocumentLog({
      document,
      commit,
      source: LogSources.API,
    })

    // Mock hydrated provider log with complete data
    const mockHydratedLog = {
      id: 1,
      workspaceId: workspace.id,
      uuid: 'test-uuid',
      documentLogUuid: 'doc-log-uuid',
      providerId: 1,
      model: 'gpt-3.5-turbo',
      finishReason: 'stop',
      config: { model: 'gpt-3.5-turbo' },
      messages: [{ role: 'user', content: 'Hello' }],
      output: { text: 'Hello, how can I help you?' },
      responseObject: { content: 'Hello, how can I help you?' },
      responseText: 'Hello, how can I help you?',
      responseReasoning: 'Generated response based on input',
      toolCalls: [],
      tokens: 150,
      costInMillicents: 500,
      duration: 1000,
      source: LogSources.API,
      apiKeyId: 1,
      generatedAt: new Date(),
      fileKey: 'test-file-key',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.mocked(hydrateProviderLog).mockResolvedValue(
      Result.ok(mockHydratedLog as any),
    )

    // Run the job
    const result = await downloadLogsJob(mockJob)

    // Verify results
    expect(hydrateProviderLog).toHaveBeenCalled()
    expect(mockDisk.putStream).toHaveBeenCalled()

    // Verify that hydrateProviderLog was called with the row data
    expect(hydrateProviderLog).toHaveBeenCalled()
    expect(mockDisk.putStream).toHaveBeenCalled()

    // Verify the mock was called with the expected row structure
    const hydrateCall = vi.mocked(hydrateProviderLog).mock.calls[0]
    const rowPassedToHydrate = hydrateCall[0]
    expect(rowPassedToHydrate).toHaveProperty('uuid')
    expect(rowPassedToHydrate).toHaveProperty('duration')
    expect(rowPassedToHydrate).toHaveProperty('tokens')
  })
})
