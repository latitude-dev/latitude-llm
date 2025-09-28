import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { Job } from 'bullmq'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogSources, Providers } from '@latitude-data/constants'
import { Result } from '../../../lib/Result'
import * as factories from '../../../tests/factories'
import { mockToolRequestsCopilot } from '../../../tests/helpers'
import { WebsocketClient } from '../../../websockets/workers'
import * as utils from '../../utils/progressTracker'
import * as runDocumentAtCommitWithAutoToolResponses from './runDocumentAtCommitWithAutoToolResponses'

const incrementErrorsMock = vi.hoisted(() => vi.fn())

describe('runDocumentJob', () => {
  let mockJob: Job
  let workspace: any
  let project: any
  let document: any
  let commit: any

  vi.spyOn(WebsocketClient, 'sendEvent').mockImplementation(vi.fn())
  vi.mock(import('../../../redis'), async (importOriginal) => {
    const actual = await importOriginal()
    return {
      ...actual,
      buildRedisConnection: vi.fn(),
    }
  })
  vi.spyOn(
    runDocumentAtCommitWithAutoToolResponses,
    'runDocumentAtCommitWithAutoToolResponses',
  )
  // @ts-ignore
  vi.spyOn(utils, 'ProgressTracker').mockImplementation(() => ({
    incrementCompleted: vi.fn(),
    incrementErrors: incrementErrorsMock,
    getProgress: vi.fn().mockReturnValue({ completed: 0, errors: 0, total: 1 }),
    cleanup: vi.fn(),
  }))

  beforeAll(async () => {
    await mockToolRequestsCopilot()
  })

  beforeEach(async () => {
    vi.clearAllMocks()

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
      data: {
        workspaceId: workspace.id,
        documentUuid: document.documentUuid,
        commitUuid: commit.uuid,
        projectId: project.id,
        parameters: { param1: 'value1' },
        batchId: 'batch1',
        autoRespondToolCalls: true,
      },
    } as Job<any>
  })

  it('should run document successfully and emit status', async () => {
    const mod = await import('./runDocumentJob')
    const runDocumentJob = mod.runDocumentJob
    const mockResult = {
      errorableUuid: 'log1',
      lastResponse: Promise.resolve({ providerLog: { uuid: 'log1' } }),
      toolCalls: Promise.resolve([]),
      messages: Promise.resolve([]),
      trace: factories.createTelemetryTrace({}),
    }
    vi.mocked(
      runDocumentAtCommitWithAutoToolResponses.runDocumentAtCommitWithAutoToolResponses,
    ).mockResolvedValue(
      // @ts-ignore
      Result.ok(mockResult),
    )

    await runDocumentJob(mockJob)

    expect(
      runDocumentAtCommitWithAutoToolResponses.runDocumentAtCommitWithAutoToolResponses,
    ).toHaveBeenCalledWith({
      context: expect.anything(),
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      parameters: { param1: 'value1' },
      source: LogSources.Playground,
    })

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith(
      'documentBatchRunStatus',
      {
        workspaceId: workspace.id,
        data: expect.objectContaining({
          documentUuid: document.documentUuid,
          completed: 0,
          errors: 0,
          total: 1,
        }),
      },
    )

    expect(incrementErrorsMock).not.toHaveBeenCalled()
  })

  it('should handle errors and update progress tracker', async () => {
    const mod = await import('./runDocumentJob')
    const runDocumentJob = mod.runDocumentJob

    vi.mocked(
      runDocumentAtCommitWithAutoToolResponses.runDocumentAtCommitWithAutoToolResponses,
    ).mockRejectedValue(new Error('Test error'))

    await runDocumentJob(mockJob)

    expect(WebsocketClient.sendEvent).toHaveBeenCalledWith(
      'documentBatchRunStatus',
      {
        workspaceId: workspace.id,
        data: expect.objectContaining({
          documentUuid: document.documentUuid,
          completed: 0,
          errors: 0,
          total: 1,
        }),
      },
    )

    expect(
      runDocumentAtCommitWithAutoToolResponses.runDocumentAtCommitWithAutoToolResponses,
    ).toHaveBeenCalled()
    expect(incrementErrorsMock).toHaveBeenCalled()
  })

  it('should throw an error when document run fails with rate limit error', async () => {
    const mod = await import('./runDocumentJob')
    const runDocumentJob = mod.runDocumentJob
    const rateLimitError = new ChainError({
      code: RunErrorCodes.RateLimit,
      message: 'Rate limit error',
    })

    vi.mocked(
      runDocumentAtCommitWithAutoToolResponses.runDocumentAtCommitWithAutoToolResponses,
    ).mockRejectedValue(rateLimitError)

    await expect(runDocumentJob(mockJob)).rejects.toThrow('Rate limit error')

    expect(incrementErrorsMock).not.toHaveBeenCalled()
  })
})
