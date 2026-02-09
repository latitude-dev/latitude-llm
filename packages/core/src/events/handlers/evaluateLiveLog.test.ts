import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
  DEFAULT_EVALUATION_SAMPLE_RATE,
  EvaluationType,
  EvaluationV2,
  LogSources,
  PromptSpanMetadata,
  RuleEvaluationMetric,
  Span,
  SpanType,
} from '../../constants'
import { evaluateLiveLogJob } from './evaluateLiveLog'
import { SpanCreatedEvent } from '../events'

vi.mock('../../data-access/workspaces', () => ({
  unsafelyFindWorkspace: vi.fn(),
}))

vi.mock('../../jobs/queues', () => ({
  queues: vi.fn(),
}))

vi.mock('../../repositories', () => ({
  CommitsRepository: vi.fn(),
  EvaluationsV2Repository: vi.fn(),
  SpanMetadatasRepository: vi.fn(),
  SpansRepository: vi.fn(),
}))

vi.mock('../../services/evaluationsV2/specifications', () => ({
  getEvaluationMetricSpecification: vi.fn(),
}))

vi.mock('../../services/workspaceFeatures/isFeatureEnabledByName', () => ({
  isFeatureEnabledByName: vi.fn(),
}))

vi.mock('../../utils/datadogCapture', () => ({
  captureException: vi.fn(),
}))

import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { queues } from '../../jobs/queues'
import {
  CommitsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../repositories'
import { getEvaluationMetricSpecification } from '../../services/evaluationsV2/specifications'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import { Result } from '../../lib/Result'

describe('evaluateLiveLogJob', () => {
  const mockWorkspace = { id: 1, name: 'Test Workspace' }
  const mockCommit = { id: 1, uuid: 'commit-uuid' }
  const mockSpan: Span = {
    id: 'span-1',
    traceId: 'trace-1',
    workspaceId: 1,
    type: SpanType.Prompt,
    source: LogSources.API,
    commitUuid: 'commit-uuid',
    documentUuid: 'doc-uuid',
    documentLogUuid: 'log-uuid',
    apiKeyId: 1,
    name: 'test-span',
    startedAt: new Date(),
    endedAt: new Date(),
    duration: 100,
    status: 'ok',
    kind: 'client',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Span
  const mockSpanMetadata: PromptSpanMetadata = {
    messages: [],
    parameters: {},
    template: '',
  } as unknown as PromptSpanMetadata

  const mockEvaluationsQueue = {
    add: vi.fn(),
    getJob: vi.fn(),
  }

  const mockSpansRepositoryGet = vi.fn()
  const mockSpansRepositoryIsFirstMainSpanInConversation = vi.fn()
  const mockSpanMetadatasRepositoryGet = vi.fn()
  const mockCommitsRepositoryGetCommitByUuid = vi.fn()
  const mockEvaluationsV2RepositoryListAtCommitByDocument = vi.fn()

  function createEvaluation(
    overrides: Partial<EvaluationV2> = {},
  ): EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch> {
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
      evaluateLiveLogs: true,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        caseInsensitive: false,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>
  }

  function createEvent(overrides: Partial<SpanCreatedEvent['data']> = {}): {
    data: SpanCreatedEvent
  } {
    return {
      data: {
        type: 'spanCreated',
        data: {
          spanId: 'span-1',
          traceId: 'trace-1',
          workspaceId: 1,
          apiKeyId: 1,
          documentUuid: 'doc-uuid',
          ...overrides,
        },
      } as SpanCreatedEvent,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(unsafelyFindWorkspace).mockResolvedValue(mockWorkspace as any)
    vi.mocked(queues).mockResolvedValue({
      evaluationsQueue: mockEvaluationsQueue,
    } as any)

    vi.mocked(SpansRepository).mockImplementation(
      () =>
        ({
          get: mockSpansRepositoryGet,
          isFirstMainSpanInConversation:
            mockSpansRepositoryIsFirstMainSpanInConversation,
        }) as unknown as SpansRepository,
    )
    vi.mocked(SpanMetadatasRepository).mockImplementation(
      () =>
        ({
          get: mockSpanMetadatasRepositoryGet,
        }) as unknown as SpanMetadatasRepository,
    )
    vi.mocked(CommitsRepository).mockImplementation(
      () =>
        ({
          getCommitByUuid: mockCommitsRepositoryGetCommitByUuid,
        }) as unknown as CommitsRepository,
    )
    vi.mocked(EvaluationsV2Repository).mockImplementation(
      () =>
        ({
          listAtCommitByDocument:
            mockEvaluationsV2RepositoryListAtCommitByDocument,
        }) as unknown as EvaluationsV2Repository,
    )

    mockSpansRepositoryGet.mockResolvedValue(Result.ok(mockSpan))
    mockSpanMetadatasRepositoryGet.mockResolvedValue(
      Result.ok(mockSpanMetadata),
    )
    mockCommitsRepositoryGetCommitByUuid.mockResolvedValue(
      Result.ok(mockCommit),
    )
    vi.mocked(getEvaluationMetricSpecification).mockReturnValue({
      supportsLiveEvaluation: true,
    } as any)
    vi.mocked(isFeatureEnabledByName).mockResolvedValue(Result.ok(false))
  })

  describe('trigger target: every (default)', () => {
    it('should enqueue evaluation job for span without trigger config', async () => {
      const evaluation = createEvaluation()
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          workspaceId: 1,
          commitId: 1,
          evaluationUuid: 'eval-uuid',
          spanId: 'span-1',
          traceId: 'trace-1',
        }),
        expect.objectContaining({
          deduplication: expect.any(Object),
        }),
      )
    })

    it('should enqueue evaluation job with trigger target "every"', async () => {
      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          evaluationUuid: 'eval-uuid',
        }),
        expect.objectContaining({
          deduplication: expect.any(Object),
        }),
      )
      expect(mockEvaluationsQueue.add).not.toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.anything(),
        expect.objectContaining({ delay: expect.any(Number) }),
      )
    })
  })

  describe('trigger target: first', () => {
    it('should enqueue evaluation job only for first span in conversation', async () => {
      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'first',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )
      mockSpansRepositoryIsFirstMainSpanInConversation.mockResolvedValue(true)

      await evaluateLiveLogJob(createEvent())

      expect(
        mockSpansRepositoryIsFirstMainSpanInConversation,
      ).toHaveBeenCalledWith('log-uuid', 'span-1', 'trace-1')
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          evaluationUuid: 'eval-uuid',
        }),
        expect.any(Object),
      )
    })

    it('should skip evaluation job for non-first span in conversation', async () => {
      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'first',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )
      mockSpansRepositoryIsFirstMainSpanInConversation.mockResolvedValue(false)

      await evaluateLiveLogJob(createEvent())

      expect(
        mockSpansRepositoryIsFirstMainSpanInConversation,
      ).toHaveBeenCalledWith('log-uuid', 'span-1', 'trace-1')
      expect(mockEvaluationsQueue.add).not.toHaveBeenCalled()
    })
  })

  describe('trigger target: last', () => {
    it('should schedule delayed job for last trigger', async () => {
      const debounceSeconds = 60
      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'last',
            lastInteractionDebounce: debounceSeconds,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )
      mockEvaluationsQueue.getJob.mockResolvedValue(null)

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({
          evaluationUuid: 'eval-uuid',
        }),
        expect.objectContaining({
          jobId: 'debouncedEvaluation-log-uuid-eval-uuid',
          delay: debounceSeconds * 1000,
          deduplication: expect.any(Object),
        }),
      )
    })

    it('should remove existing delayed job before scheduling new one', async () => {
      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'last',
            lastInteractionDebounce: 120,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )
      const mockExistingJob = { remove: vi.fn() }
      mockEvaluationsQueue.getJob.mockResolvedValue(mockExistingJob)

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.getJob).toHaveBeenCalledWith(
        'debouncedEvaluation-log-uuid-eval-uuid',
      )
      expect(mockExistingJob.remove).toHaveBeenCalled()
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.anything(),
        expect.objectContaining({
          jobId: 'debouncedEvaluation-log-uuid-eval-uuid',
          delay: 120 * 1000,
        }),
      )
    })

    it('should use default debounce when not specified', async () => {
      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'last',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )
      mockEvaluationsQueue.getJob.mockResolvedValue(null)

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.anything(),
        expect.objectContaining({
          delay: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS * 1000,
        }),
      )
    })
  })

  describe('multiple evaluations with different triggers', () => {
    it('should handle multiple evaluations with different trigger types', async () => {
      const everyEvaluation = createEvaluation({
        uuid: 'eval-every',
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: 120,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      const firstEvaluation = createEvaluation({
        uuid: 'eval-first',
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'first',
            lastInteractionDebounce: 120,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      const lastEvaluation = createEvaluation({
        uuid: 'eval-last',
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'last',
            lastInteractionDebounce: 60,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })

      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([everyEvaluation, firstEvaluation, lastEvaluation]),
      )
      mockSpansRepositoryIsFirstMainSpanInConversation.mockResolvedValue(true)
      mockEvaluationsQueue.getJob.mockResolvedValue(null)

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(3)
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({ evaluationUuid: 'eval-every' }),
        expect.not.objectContaining({ delay: expect.any(Number) }),
      )
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({ evaluationUuid: 'eval-first' }),
        expect.not.objectContaining({ delay: expect.any(Number) }),
      )
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({ evaluationUuid: 'eval-last' }),
        expect.objectContaining({ delay: 60 * 1000 }),
      )
    })
  })

  describe('sampling rate', () => {
    it('should always enqueue when sampleRate is 100 (default)', async () => {
      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: 100,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(1)
    })

    it('should skip evaluation when random value exceeds sampleRate', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: 20,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).not.toHaveBeenCalled()
    })

    it('should enqueue evaluation when random value is below sampleRate', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1)

      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: 20,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(1)
    })

    it('should apply sampling independently per evaluation', async () => {
      let callCount = 0
      vi.spyOn(Math, 'random').mockImplementation(() => {
        callCount++
        return callCount === 1 ? 0.1 : 0.9
      })

      const evaluation1 = createEvaluation({
        uuid: 'eval-sampled',
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: 50,
          },
        },
      })
      const evaluation2 = createEvaluation({
        uuid: 'eval-skipped',
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: 50,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation1, evaluation2]),
      )

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(1)
      expect(mockEvaluationsQueue.add).toHaveBeenCalledWith(
        'runEvaluationV2Job',
        expect.objectContaining({ evaluationUuid: 'eval-sampled' }),
        expect.any(Object),
      )
    })

    it('should not apply sampling when sampleRate is not set (defaults to 100)', async () => {
      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(1)
    })

    it('should apply sampling with "last" trigger target', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.9)

      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'last',
            lastInteractionDebounce: 60,
            sampleRate: 50,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )
      mockEvaluationsQueue.getJob.mockResolvedValue(null)

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).not.toHaveBeenCalled()
    })

    it('should apply sampling after "first" trigger check passes', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.9)

      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'first',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: 50,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )
      mockSpansRepositoryIsFirstMainSpanInConversation.mockResolvedValue(true)

      await evaluateLiveLogJob(createEvent())

      expect(
        mockSpansRepositoryIsFirstMainSpanInConversation,
      ).toHaveBeenCalled()
      expect(mockEvaluationsQueue.add).not.toHaveBeenCalled()
    })

    it('should enqueue at sampleRate boundary (random exactly at threshold)', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.199999)

      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
            sampleRate: 20,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )

      await evaluateLiveLogJob(createEvent())

      expect(mockEvaluationsQueue.add).toHaveBeenCalledTimes(1)
    })
  })

  describe('edge cases', () => {
    it('should return early if span has no documentLogUuid', async () => {
      const spanWithoutDocLogUuid = { ...mockSpan, documentLogUuid: null }
      mockSpansRepositoryGet.mockResolvedValue(Result.ok(spanWithoutDocLogUuid))

      await evaluateLiveLogJob(createEvent())

      expect(
        mockEvaluationsV2RepositoryListAtCommitByDocument,
      ).not.toHaveBeenCalled()
      expect(mockEvaluationsQueue.add).not.toHaveBeenCalled()
    })

    it('should not call isFirstMainSpanInConversation for every trigger', async () => {
      const evaluation = createEvaluation({
        configuration: {
          reverseScale: false,
          actualOutput: { messageSelection: 'last', parsingFormat: 'string' },
          caseInsensitive: false,
          trigger: {
            target: 'every',
            lastInteractionDebounce: 120,
            sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
          },
        },
      })
      mockEvaluationsV2RepositoryListAtCommitByDocument.mockResolvedValue(
        Result.ok([evaluation]),
      )

      await evaluateLiveLogJob(createEvent())

      expect(
        mockSpansRepositoryIsFirstMainSpanInConversation,
      ).not.toHaveBeenCalled()
    })
  })
})
