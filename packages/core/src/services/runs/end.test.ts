import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ActiveRun } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import { NotFoundError } from '../../lib/errors'
import { endRun, RunMetrics } from './end'
import { publisher } from '../../events/publisher'
import * as deleteModule from './active/byDocument/delete'

vi.mock('../../events/publisher', () => ({
  publisher: {
    publishLater: vi.fn(),
  },
}))

vi.spyOn(deleteModule, 'deleteActiveRunByDocument')

describe('endRun', () => {
  const mockActiveRun: ActiveRun = {
    uuid: 'run-uuid-123',
    queuedAt: new Date('2024-01-01T10:00:00Z'),
    startedAt: new Date('2024-01-01T10:00:01Z'),
    documentUuid: 'doc-uuid-456',
    commitUuid: 'commit-uuid-789',
  }

  const baseParams = {
    workspaceId: 1,
    projectId: 2,
    documentUuid: 'doc-uuid-456',
    commitUuid: 'commit-uuid-789',
    runUuid: 'run-uuid-123',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(publisher.publishLater).mockResolvedValue(undefined)
  })

  describe('deleteActiveRunByDocument integration', () => {
    it('calls deleteActiveRunByDocument with correct parameters', async () => {
      vi.mocked(deleteModule.deleteActiveRunByDocument).mockResolvedValue(
        Result.ok(mockActiveRun),
      )

      await endRun(baseParams)

      expect(deleteModule.deleteActiveRunByDocument).toHaveBeenCalledWith({
        workspaceId: baseParams.workspaceId,
        projectId: baseParams.projectId,
        documentUuid: baseParams.documentUuid,
        runUuid: baseParams.runUuid,
      })
    })

    it('returns error if deleteActiveRunByDocument fails', async () => {
      const error = new NotFoundError('Run not found')
      vi.mocked(deleteModule.deleteActiveRunByDocument).mockResolvedValue(
        Result.error(error),
      )

      const result = await endRun(baseParams)

      expect(result.ok).toBe(false)
      expect(result.error).toBe(error)
      expect(publisher.publishLater).not.toHaveBeenCalled()
    })

    it('returns the deleted run on success', async () => {
      vi.mocked(deleteModule.deleteActiveRunByDocument).mockResolvedValue(
        Result.ok(mockActiveRun),
      )

      const result = await endRun(baseParams)

      expect(result.ok).toBe(true)
      expect(result.value).toBe(mockActiveRun)
    })
  })

  describe('event publishing', () => {
    beforeEach(() => {
      vi.mocked(deleteModule.deleteActiveRunByDocument).mockResolvedValue(
        Result.ok(mockActiveRun),
      )
    })

    it('publishes documentRunEnded event with correct base data', async () => {
      await endRun(baseParams)

      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentRunEnded',
        data: {
          projectId: baseParams.projectId,
          workspaceId: baseParams.workspaceId,
          documentUuid: baseParams.documentUuid,
          commitUuid: baseParams.commitUuid,
          run: mockActiveRun,
          eventContext: 'background',
          metrics: undefined,
          experimentId: undefined,
        },
      })
    })

    it('includes metrics in event when provided', async () => {
      const metrics: RunMetrics = {
        runUsage: {
          inputTokens: 100,
          outputTokens: 50,
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          reasoningTokens: 10,
          cachedInputTokens: 5,
        },
        runCost: 0.0025,
        duration: 1500,
      }

      await endRun({ ...baseParams, metrics })

      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentRunEnded',
        data: expect.objectContaining({
          metrics,
        }),
      })
    })

    it('includes experimentId in event when provided', async () => {
      const experimentId = 42

      await endRun({ ...baseParams, experimentId })

      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentRunEnded',
        data: expect.objectContaining({
          experimentId,
        }),
      })
    })

    it('includes both metrics and experimentId when provided', async () => {
      const metrics: RunMetrics = {
        runUsage: {
          inputTokens: 200,
          outputTokens: 100,
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
          reasoningTokens: 20,
          cachedInputTokens: 10,
        },
        runCost: 0.005,
        duration: 2000,
      }
      const experimentId = 99

      await endRun({ ...baseParams, metrics, experimentId })

      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentRunEnded',
        data: {
          projectId: baseParams.projectId,
          workspaceId: baseParams.workspaceId,
          documentUuid: baseParams.documentUuid,
          commitUuid: baseParams.commitUuid,
          run: mockActiveRun,
          eventContext: 'background',
          metrics,
          experimentId,
        },
      })
    })
  })

  describe('edge cases', () => {
    it('handles run with no startedAt', async () => {
      const runWithoutStart: ActiveRun = {
        uuid: 'run-uuid-no-start',
        queuedAt: new Date('2024-01-01T10:00:00Z'),
        startedAt: undefined,
        documentUuid: 'doc-uuid-456',
        commitUuid: 'commit-uuid-789',
      }

      vi.mocked(deleteModule.deleteActiveRunByDocument).mockResolvedValue(
        Result.ok(runWithoutStart),
      )

      const result = await endRun(baseParams)

      expect(result.ok).toBe(true)
      expect(result.value).toBe(runWithoutStart)
      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentRunEnded',
        data: expect.objectContaining({
          run: runWithoutStart,
        }),
      })
    })

    it('handles metrics with zero values', async () => {
      vi.mocked(deleteModule.deleteActiveRunByDocument).mockResolvedValue(
        Result.ok(mockActiveRun),
      )

      const metrics: RunMetrics = {
        runUsage: {
          inputTokens: 0,
          outputTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          reasoningTokens: 0,
          cachedInputTokens: 0,
        },
        runCost: 0,
        duration: 0,
      }

      await endRun({ ...baseParams, metrics })

      expect(publisher.publishLater).toHaveBeenCalledWith({
        type: 'documentRunEnded',
        data: expect.objectContaining({
          metrics,
        }),
      })
    })

    it('handles generic error from deleteActiveRunByDocument', async () => {
      const error = new Error('Redis connection failed')
      vi.mocked(deleteModule.deleteActiveRunByDocument).mockResolvedValue(
        Result.error(error),
      )

      const result = await endRun(baseParams)

      expect(result.ok).toBe(false)
      expect(result.error).toBe(error)
    })
  })
})
