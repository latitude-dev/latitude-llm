import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Job } from 'bullmq'
import {
  EvaluationType,
  EvaluationV2,
  RuleEvaluationMetric,
  Span,
  SpanType,
} from '../../../constants'
import {
  runEvaluationForExperimentJob,
  RunEvaluationForExperimentJobData,
} from './runEvaluationForExperimentJob'
import { Result } from '../../../lib/Result'

vi.mock('../../queues', () => ({
  queues: vi.fn(),
}))

vi.mock('../../../repositories', () => ({
  CommitsRepository: vi.fn(),
  EvaluationsV2Repository: vi.fn(),
  ExperimentsRepository: vi.fn(),
}))

vi.mock('../../../queries/spans/findByDocumentLogUuid', () => ({
  findAllSpansByDocumentLogUuid: vi.fn(),
}))

vi.mock('../../../queries/spans/findTraceIdsByLogUuid', () => ({
  findLastTraceIdByLogUuid: vi.fn(),
}))

vi.mock('../../../services/experiments/updateStatus', () => ({
  updateExperimentStatus: vi.fn(),
}))

vi.mock('../../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

import { queues } from '../../queues'
import {
  CommitsRepository,
  EvaluationsV2Repository,
  ExperimentsRepository,
} from '../../../repositories'
import { findAllSpansByDocumentLogUuid } from '../../../queries/spans/findByDocumentLogUuid'
import { findLastTraceIdByLogUuid } from '../../../queries/spans/findTraceIdsByLogUuid'

describe('runEvaluationForExperimentJob', () => {
  const mockEvaluationsQueue = {
    add: vi.fn(),
  }

  const mockExperimentsRepositoryFindByUuid = vi.fn()
  const mockCommitsRepositoryGetCommitById = vi.fn()
  const mockEvaluationsV2RepositoryGetAtCommitByDocument = vi.fn()
  const mockExperiment = {
    uuid: 'exp-uuid',
    documentUuid: 'doc-uuid',
    finishedAt: null,
  }

  const mockCommit = { id: 1, uuid: 'commit-uuid' }

  function createSpan(
    id: string,
    type: SpanType = SpanType.Prompt,
    startedAt: Date = new Date(),
  ): Span {
    return {
      id,
      traceId: `trace-${id}`,
      type,
      startedAt,
      workspaceId: 1,
    } as unknown as Span
  }

  function createEvaluation(
    triggerTarget?: 'first' | 'every' | 'last',
  ): EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch> {
    const config: any = {
      reverseScale: false,
      actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
      caseInsensitive: false,
    }
    if (triggerTarget) {
      config.trigger = { target: triggerTarget, lastInteractionDebounce: 120 }
    }
    return {
      uuid: 'eval-uuid',
      versionId: 1,
      workspaceId: 1,
      commitId: 1,
      documentUuid: 'doc-uuid',
      name: 'Test Evaluation',
      description: 'Test description',
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.ExactMatch,
      configuration: config,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>
  }

  function createJobData(
    overrides: Partial<RunEvaluationForExperimentJobData> = {},
  ): RunEvaluationForExperimentJobData {
    return {
      workspaceId: 1,
      conversationUuid: 'conversation-uuid',
      experimentUuid: 'exp-uuid',
      evaluationUuid: 'eval-uuid',
      commitId: 1,
      ...overrides,
    }
  }

  function createMockJob(
    data: RunEvaluationForExperimentJobData,
  ): Job<RunEvaluationForExperimentJobData> {
    return {
      id: 'test-job-id',
      data,
      attemptsStarted: 0,
      moveToDelayed: vi.fn(),
    } as unknown as Job<RunEvaluationForExperimentJobData>
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(queues).mockResolvedValue({
      evaluationsQueue: mockEvaluationsQueue,
    } as any)

    vi.mocked(ExperimentsRepository).mockImplementation(
      () =>
        ({
          findByUuid: mockExperimentsRepositoryFindByUuid,
        }) as unknown as ExperimentsRepository,
    )
    vi.mocked(CommitsRepository).mockImplementation(
      () =>
        ({
          getCommitById: mockCommitsRepositoryGetCommitById,
        }) as unknown as CommitsRepository,
    )
    vi.mocked(EvaluationsV2Repository).mockImplementation(
      () =>
        ({
          getAtCommitByDocument:
            mockEvaluationsV2RepositoryGetAtCommitByDocument,
        }) as unknown as EvaluationsV2Repository,
    )
    mockExperimentsRepositoryFindByUuid.mockResolvedValue(
      Result.ok(mockExperiment),
    )
    mockCommitsRepositoryGetCommitById.mockResolvedValue(Result.ok(mockCommit))
  })

  describe('trigger target: first (default without trigger config)', () => {
    it('should evaluate only the first prompt span when no trigger config', async () => {
      const evaluation = createEvaluation()
      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluation),
      )

      const spans = [
        createSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
        createSpan('span-3', SpanType.Prompt, new Date('2024-01-01T00:02:00Z')),
      ]
      vi.mocked(findAllSpansByDocumentLogUuid).mockResolvedValue(spans)

      const job = createMockJob(createJobData())
      await runEvaluationForExperimentJob(job)

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(3)
    })

    it('should evaluate only the first prompt span with trigger target "first"', async () => {
      const evaluation = createEvaluation('first')
      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluation),
      )

      const spans = [
        createSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
        createSpan('span-3', SpanType.Prompt, new Date('2024-01-01T00:02:00Z')),
      ]
      vi.mocked(findAllSpansByDocumentLogUuid).mockResolvedValue(spans)

      const job = createMockJob(createJobData())
      await runEvaluationForExperimentJob(job)

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(1)
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          spanId: 'span-1',
          traceId: 'trace-span-1',
        }),
        expect.any(Object),
      )
    })
  })

  describe('trigger target: every', () => {
    it('should evaluate all prompt spans with trigger target "every"', async () => {
      const evaluation = createEvaluation('every')
      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluation),
      )

      const spans = [
        createSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createSpan(
          'span-tool',
          SpanType.Tool,
          new Date('2024-01-01T00:00:30Z'),
        ),
        createSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
        createSpan('span-3', SpanType.Prompt, new Date('2024-01-01T00:02:00Z')),
      ]
      vi.mocked(findAllSpansByDocumentLogUuid).mockResolvedValue(spans)

      const job = createMockJob(createJobData())
      await runEvaluationForExperimentJob(job)

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(3)
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({ spanId: 'span-1' }),
        expect.any(Object),
      )
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({ spanId: 'span-2' }),
        expect.any(Object),
      )
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({ spanId: 'span-3' }),
        expect.any(Object),
      )
    })
  })

  describe('trigger target: last', () => {
    it('should evaluate only the last prompt span with trigger target "last"', async () => {
      const evaluation = createEvaluation('last')
      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluation),
      )

      const spans = [
        createSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
        createSpan('span-3', SpanType.Prompt, new Date('2024-01-01T00:02:00Z')),
      ]
      vi.mocked(findAllSpansByDocumentLogUuid).mockResolvedValue(spans)

      const job = createMockJob(createJobData())
      await runEvaluationForExperimentJob(job)

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(1)
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          spanId: 'span-3',
          traceId: 'trace-span-3',
        }),
        expect.any(Object),
      )
    })
  })

  describe('filtering non-prompt spans', () => {
    it('should only consider Prompt type spans for evaluation', async () => {
      const evaluation = createEvaluation('every')
      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluation),
      )

      const spans = [
        createSpan('span-1', SpanType.Prompt, new Date('2024-01-01T00:00:00Z')),
        createSpan(
          'span-tool',
          SpanType.Tool,
          new Date('2024-01-01T00:00:30Z'),
        ),
        createSpan(
          'span-completion',
          SpanType.Completion,
          new Date('2024-01-01T00:00:45Z'),
        ),
        createSpan('span-2', SpanType.Prompt, new Date('2024-01-01T00:01:00Z')),
      ]
      vi.mocked(findAllSpansByDocumentLogUuid).mockResolvedValue(spans)

      const job = createMockJob(createJobData())
      await runEvaluationForExperimentJob(job)

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(2)
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({ spanId: 'span-1' }),
        expect.any(Object),
      )
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({ spanId: 'span-2' }),
        expect.any(Object),
      )
    })
  })

  describe('edge cases', () => {
    it('should return early if experiment is finished', async () => {
      mockExperimentsRepositoryFindByUuid.mockResolvedValue(
        Result.ok({ ...mockExperiment, finishedAt: new Date() }),
      )

      const job = createMockJob(createJobData())
      await runEvaluationForExperimentJob(job)

      expect(
        mockEvaluationsV2RepositoryGetAtCommitByDocument,
      ).not.toHaveBeenCalled()
      expect(mockEvaluationsQueue.add).not.toHaveBeenCalled()
    })

    it('should retry when no spans found yet', async () => {
      const evaluation = createEvaluation('every')
      mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
        Result.ok(evaluation),
      )
      vi.mocked(findAllSpansByDocumentLogUuid).mockResolvedValue([])
      vi.mocked(findLastTraceIdByLogUuid).mockResolvedValue(undefined)

      const job = createMockJob(createJobData())

      await expect(runEvaluationForExperimentJob(job)).rejects.toThrow(
        'Waiting for trace to show up',
      )
      expect(job.moveToDelayed).toHaveBeenCalled()
      expect(mockEvaluationsQueue.add).not.toHaveBeenCalled()
    })

    it('should handle single span correctly for all trigger types', async () => {
      const singleSpan = createSpan(
        'only-span',
        SpanType.Prompt,
        new Date('2024-01-01T00:00:00Z'),
      )
      vi.mocked(findAllSpansByDocumentLogUuid).mockResolvedValue([singleSpan])

      for (const target of ['first', 'every', 'last'] as const) {
        vi.clearAllMocks()
        mockExperimentsRepositoryFindByUuid.mockResolvedValue(
          Result.ok(mockExperiment),
        )
        mockCommitsRepositoryGetCommitById.mockResolvedValue(
          Result.ok(mockCommit),
        )
        vi.mocked(findAllSpansByDocumentLogUuid).mockResolvedValue([singleSpan])

        const evaluation = createEvaluation(target)
        mockEvaluationsV2RepositoryGetAtCommitByDocument.mockResolvedValue(
          Result.ok(evaluation),
        )

        const job = createMockJob(createJobData())
        await runEvaluationForExperimentJob(job)

        expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(1)
        expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
          'runEvaluationV2Job',
          expect.objectContaining({ spanId: 'only-span' }),
          expect.any(Object),
        )
      }
    })
  })
})
