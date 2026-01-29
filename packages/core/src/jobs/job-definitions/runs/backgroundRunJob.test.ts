import { Job } from 'bullmq'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LogSources,
  ChainEventTypes,
  Providers,
} from '@latitude-data/constants'
import { Result } from '../../../lib/Result'
import { LatitudeError } from '../../../lib/errors'
import * as factories from '../../../tests/factories'
import { mockToolRequestsCopilot } from '../../../tests/helpers'
import { RedisStream } from '../../../lib/redisStream'
import { publisher } from '../../../events/publisher'
import * as cancelJobsModule from '../../../lib/cancelJobs'
import * as helpersModule from '../helpers'
import * as startRunModule from '../../../services/runs/start'
import * as endRunModule from '../../../services/runs/end'
import * as updateRunModule from '../../../services/runs/update'
import * as runDocumentAtCommitModule from '../../../services/commits/runDocumentAtCommit'
import type {
  BackgroundRunJobData,
  BackgroundRunJobResult,
} from './backgroundRunJob'

vi.mock('../../../lib/redisStream')
vi.mock('../../../events/publisher')
vi.mock('../../../lib/cancelJobs')

describe('backgroundRunJob', () => {
  let mockJob: Job<BackgroundRunJobData, BackgroundRunJobResult>
  let mockWriteStream: any
  let mockReadStream: any
  let workspace: any
  let project: any
  let document: any
  let commit: any

  beforeAll(async () => {
    await mockToolRequestsCopilot()
  })

  beforeEach(async () => {
    vi.clearAllMocks()

    // Create spies for the functions
    vi.spyOn(helpersModule, 'getJobDocumentData')
    vi.spyOn(startRunModule, 'startRun')
    vi.spyOn(endRunModule, 'endRun')
    vi.spyOn(updateRunModule, 'updateRun')
    vi.spyOn(runDocumentAtCommitModule, 'runDocumentAtCommit')

    // Create mock streams
    mockWriteStream = {
      write: vi.fn(),
      cleanup: vi.fn(),
      close: vi.fn().mockReturnValue(Promise.resolve()),
    }
    mockReadStream = {
      getReader: vi.fn().mockReturnValue({
        read: vi.fn(),
        releaseLock: vi.fn(),
      }),
    }

    // Mock RedisStream constructor
    vi.mocked(RedisStream).mockImplementation(() => mockWriteStream)

    // Mock publisher
    vi.mocked(publisher.publishLater).mockResolvedValue(undefined)

    // Mock cancellation utilities (O(1) polling-based cancellation)
    vi.mocked(cancelJobsModule.createCancellationPoller).mockReturnValue(() => {})
    vi.mocked(cancelJobsModule.clearCancelJobFlag).mockResolvedValue(undefined)
    vi.mocked(cancelJobsModule.isJobCancelled).mockResolvedValue(false)

    // Create necessary resources using factories
    const setup = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'Latitude' }],
      documents: {
        'test-doc': factories.helpers.createPrompt({ provider: 'Latitude' }),
      },
    })
    workspace = setup.workspace
    project = setup.project
    document = setup.documents[0]
    commit = setup.commit

    mockJob = {
      id: 'job-123',
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        commitUuid: commit.uuid,
        documentUuid: document.documentUuid,
        runUuid: 'run-123',
        parameters: { param1: 'value1' },
        customIdentifier: 'custom-id',
        tools: ['tool1', 'tool2'],
        userMessage: 'test message',
        source: LogSources.API,
      },
    } as Job<any>
  })

  describe('error handling', () => {
    it('should handle getJobDocumentData failure by writing error to stream', async () => {
      const error = new LatitudeError('Failed to get initial data')
      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        Result.error(error),
      )

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      await backgroundRunJob(mockJob)

      expect(mockWriteStream.write).toHaveBeenCalledWith({
        type: ChainEventTypes.ChainError,
        data: error,
      })
      expect(mockWriteStream.cleanup).toHaveBeenCalled()
      expect(endRunModule.endRun).toHaveBeenCalled()
    })

    it('should handle startRun failure by writing error to stream', async () => {
      const error = new LatitudeError('Failed to start run')
      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        // @ts-expect-error - mock
        Result.ok({ workspace, document, commit }),
      )
      vi.mocked(startRunModule.startRun).mockResolvedValue(Result.error(error))

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      await backgroundRunJob(mockJob)

      expect(mockWriteStream.write).toHaveBeenCalledWith({
        type: ChainEventTypes.ChainError,
        data: error,
      })
      expect(mockWriteStream.cleanup).toHaveBeenCalled()
      expect(endRunModule.endRun).toHaveBeenCalled()
    })

    it('should handle runDocumentAtCommit failure by writing error to stream', async () => {
      const error = new LatitudeError('Document execution failed')
      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        // @ts-expect-error - mock
        Result.ok({ workspace, document, commit }),
      )
      vi.mocked(startRunModule.startRun).mockResolvedValue(Result.ok({} as any))
      vi.mocked(
        runDocumentAtCommitModule.runDocumentAtCommit,
      ).mockResolvedValue(Result.error(error))

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      await backgroundRunJob(mockJob)

      expect(mockWriteStream.write).toHaveBeenCalledWith({
        type: ChainEventTypes.ChainError,
        data: error,
      })
      expect(mockWriteStream.cleanup).toHaveBeenCalled()
      expect(endRunModule.endRun).toHaveBeenCalled()
    })
  })

  describe('cleanup and resource management', () => {
    it('should always cleanup stream and cancel poller', async () => {
      const mockStopPoller = vi.fn()
      vi.mocked(cancelJobsModule.createCancellationPoller).mockReturnValue(mockStopPoller)

      const error = new Error('Test error')
      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        Result.error(error),
      )

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      await backgroundRunJob(mockJob)

      // Always cleanup regardless of success or failure
      expect(mockWriteStream.cleanup).toHaveBeenCalled()
      expect(mockStopPoller).toHaveBeenCalled()
      expect(cancelJobsModule.clearCancelJobFlag).toHaveBeenCalledWith('job-123')
    })

    it('should always attempt to end the run even if other operations fail', async () => {
      const error = new Error('Test error')
      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        Result.error(error),
      )

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      await backgroundRunJob(mockJob)

      // Should always try to end the run
      expect(endRunModule.endRun).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: workspace.id,
          projectId: project.id,
          runUuid: 'run-123',
        }),
      )
    })
  })

  describe('stream processing', () => {
    it('should handle stream processing errors gracefully', async () => {
      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        // @ts-expect-error - mock
        Result.ok({ workspace, document, commit }),
      )
      vi.mocked(startRunModule.startRun).mockResolvedValue(Result.ok({} as any))
      vi.mocked(
        runDocumentAtCommitModule.runDocumentAtCommit,
      ).mockResolvedValue(
        Result.ok({
          stream: mockReadStream,
          errorableUuid: 'run-123',
          resolvedContent: 'content',
          error: Promise.resolve(undefined),
          lastResponse: Promise.resolve(undefined),
          toolCalls: Promise.resolve([]),
          uuid: 'run-123',
          response: Promise.resolve(undefined),
          duration: Promise.resolve(1000),
          providerLog: Promise.resolve({ uuid: 'log-123' }),
          conversation: { messages: Promise.resolve([]) },
          messages: Promise.resolve([]),
          logUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
          runUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
        }),
      )
      vi.mocked(endRunModule.endRun).mockResolvedValue(Result.ok({} as any))

      // Mock stream reader to throw error
      const reader = mockReadStream.getReader()
      vi.mocked(reader.read).mockRejectedValue(new Error('Stream read error'))

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      await backgroundRunJob(mockJob)

      expect(reader.releaseLock).toHaveBeenCalled()
      expect(mockWriteStream.cleanup).toHaveBeenCalled()
      expect(endRunModule.endRun).toHaveBeenCalled()
    })

    it('should handle updateRun failure gracefully without throwing', async () => {
      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        // @ts-expect-error - mock
        Result.ok({ workspace, document, commit }),
      )
      vi.mocked(startRunModule.startRun).mockResolvedValue(Result.ok({} as any))
      vi.mocked(
        runDocumentAtCommitModule.runDocumentAtCommit,
      ).mockResolvedValue(
        Result.ok({
          stream: mockReadStream,
          errorableUuid: 'run-123',
          resolvedContent: 'content',
          error: Promise.resolve(undefined),
          lastResponse: Promise.resolve(undefined),
          toolCalls: Promise.resolve([]),
          uuid: 'run-123',
          response: Promise.resolve(undefined),
          duration: Promise.resolve(1000),
          providerLog: Promise.resolve({ uuid: 'log-123' }),
          conversation: { messages: Promise.resolve([]) },
          messages: Promise.resolve([]),
          logUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
          runUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
        }),
      )
      vi.mocked(endRunModule.endRun).mockResolvedValue(Result.ok({} as any))
      vi.mocked(updateRunModule.updateRun).mockResolvedValue(
        Result.error(new Error('Update failed')),
      )

      // Mock stream reader to return an event that triggers updateRun
      const reader = mockReadStream.getReader()
      vi.mocked(reader.read)
        .mockResolvedValueOnce({
          done: false,
          value: {
            event: 'provider-event',
            data: { type: 'tool-call', toolName: 'test-tool' },
          },
        })
        .mockResolvedValueOnce({ done: true })

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      // Should not throw even if updateRun fails
      await expect(backgroundRunJob(mockJob)).resolves.not.toThrow()

      expect(updateRunModule.updateRun).toHaveBeenCalled()
      expect(mockWriteStream.cleanup).toHaveBeenCalled()
      expect(endRunModule.endRun).toHaveBeenCalled()
    })

    it('should handle endRun failure gracefully without throwing', async () => {
      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        // @ts-expect-error - mock
        Result.ok({ workspace, document, commit }),
      )
      vi.mocked(startRunModule.startRun).mockResolvedValue(Result.ok({} as any))
      vi.mocked(
        runDocumentAtCommitModule.runDocumentAtCommit,
      ).mockResolvedValue(
        Result.ok({
          stream: mockReadStream,
          errorableUuid: 'run-123',
          resolvedContent: 'content',
          error: Promise.resolve(undefined),
          lastResponse: Promise.resolve(undefined),
          toolCalls: Promise.resolve([]),
          uuid: 'run-123',
          response: Promise.resolve(undefined),
          duration: Promise.resolve(1000),
          providerLog: Promise.resolve({ uuid: 'log-123' }),
          conversation: { messages: Promise.resolve([]) },
          messages: Promise.resolve([]),
          logUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
          runUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
        }),
      )
      vi.mocked(endRunModule.endRun).mockResolvedValue(
        Result.error(new Error('End run failed')),
      )

      const reader = mockReadStream.getReader()
      vi.mocked(reader.read).mockResolvedValue({ done: true, value: undefined })

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      // Should not throw even if endRun fails
      await expect(backgroundRunJob(mockJob)).resolves.not.toThrow()

      expect(endRunModule.endRun).toHaveBeenCalled()
      expect(mockWriteStream.cleanup).toHaveBeenCalled()
    })

    it('should handle job cancellation correctly using polling', async () => {
      const mockStopPoller = vi.fn()
      vi.mocked(cancelJobsModule.createCancellationPoller).mockReturnValue(mockStopPoller)

      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        // @ts-expect-error - mock
        Result.ok({ workspace, document, commit }),
      )
      vi.mocked(startRunModule.startRun).mockResolvedValue(Result.ok({} as any))
      vi.mocked(
        runDocumentAtCommitModule.runDocumentAtCommit,
      ).mockResolvedValue(
        Result.ok({
          stream: mockReadStream,
          errorableUuid: 'run-123',
          resolvedContent: 'content',
          error: Promise.resolve(undefined),
          lastResponse: Promise.resolve(undefined),
          toolCalls: Promise.resolve([]),
          uuid: 'run-123',
          response: Promise.resolve(undefined),
          duration: Promise.resolve(1000),
          providerLog: Promise.resolve({ uuid: 'log-123' }),
          conversation: { messages: Promise.resolve([]) },
          messages: Promise.resolve([]),
          logUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
          runUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
        }),
      )
      vi.mocked(endRunModule.endRun).mockResolvedValue(Result.ok({} as any))

      const reader = mockReadStream.getReader()
      vi.mocked(reader.read).mockResolvedValue({ done: true, value: undefined })

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      await backgroundRunJob(mockJob)

      // Should create a cancellation poller with the job ID
      expect(cancelJobsModule.createCancellationPoller).toHaveBeenCalledWith(
        'job-123',
        expect.any(AbortController),
      )
      // Should stop the poller during cleanup
      expect(mockStopPoller).toHaveBeenCalled()
      // Should clear the cancellation flag
      expect(cancelJobsModule.clearCancelJobFlag).toHaveBeenCalledWith('job-123')
    })

    it('should handle timeout in stream processing', async () => {
      vi.mocked(helpersModule.getJobDocumentData).mockResolvedValue(
        // @ts-expect-error - mock
        Result.ok({ workspace, document, commit }),
      )
      vi.mocked(startRunModule.startRun).mockResolvedValue(Result.ok({} as any))
      vi.mocked(
        runDocumentAtCommitModule.runDocumentAtCommit,
      ).mockResolvedValue(
        Result.ok({
          stream: mockReadStream,
          errorableUuid: 'run-123',
          resolvedContent: 'content',
          error: Promise.resolve(undefined),
          lastResponse: Promise.resolve(undefined),
          toolCalls: Promise.resolve([]),
          uuid: 'run-123',
          response: Promise.resolve(undefined),
          duration: Promise.resolve(1000),
          providerLog: Promise.resolve({ uuid: 'log-123' }),
          conversation: { messages: Promise.resolve([]) },
          messages: Promise.resolve([]),
          logUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
          runUsage: Promise.resolve({
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          }),
        }),
      )
      vi.mocked(endRunModule.endRun).mockResolvedValue(Result.ok({} as any))

      // Mock stream reader to never complete (timeout scenario)
      const reader = mockReadStream.getReader()
      vi.mocked(reader.read).mockImplementation(() => {
        return new Promise(() => {
          // Never resolves to simulate timeout
        })
      })

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      await backgroundRunJob(mockJob)

      expect(reader.releaseLock).toHaveBeenCalled()
      expect(mockWriteStream.cleanup).toHaveBeenCalled()
      expect(endRunModule.endRun).toHaveBeenCalled()
    })

    it('should handle errors that are not Result.error instances', async () => {
      const error = new Error('Generic error')
      vi.mocked(helpersModule.getJobDocumentData).mockRejectedValue(error)

      const mod = await import('./backgroundRunJob')
      const backgroundRunJob = mod.backgroundRunJob

      await backgroundRunJob(mockJob)

      expect(mockWriteStream.write).toHaveBeenCalledWith({
        type: ChainEventTypes.ChainError,
        data: error,
      })
      expect(mockWriteStream.cleanup).toHaveBeenCalled()
      expect(endRunModule.endRun).toHaveBeenCalled()
    })
  })
})
