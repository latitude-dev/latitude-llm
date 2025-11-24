import { Providers, SpanType, SpanWithDetails } from '@latitude-data/constants'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { z } from 'zod'
import {
  EVALUATION_SCORE_SCALE,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { annotateEvaluationV2 } from './annotate'
import { HumanEvaluationRatingSpecification } from './human/rating'
import * as outputs from './outputs/extract'

describe('annotateEvaluationV2', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<
    EvaluationType.Human,
    HumanEvaluationMetric.Rating
  >
  let span: SpanWithDetails<SpanType.Prompt>

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      documents,
      commit: c,
      apiKeys,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        prompt: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
      },
    })

    workspace = w
    commit = c
    document = documents[0]!

    evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      type: EvaluationType.Human,
      metric: HumanEvaluationMetric.Rating,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        criteria: 'criteria',
        minRating: 1,
        minRatingDescription: 'min description',
        maxRating: 5,
        maxRatingDescription: 'max description',
        minThreshold: 3,
      },
    })

    span = (await factories.createSpan({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      apiKeyId: apiKeys[0]!.id,
    })) as SpanWithDetails<SpanType.Prompt>

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }

    // Mock the same functions we mocked in run.test.ts
    vi.spyOn(
      await import('../tracing/traces/assemble'),
      'assembleTrace',
    ).mockResolvedValue(
      Result.ok({
        trace: {
          id: 'trace-id',
          spans: [],
          duration: 1000,
          startedAt: new Date(),
          endedAt: new Date(),
        },
      } as any),
    )

    vi.spyOn(
      await import('../tracing/spans/findFirstSpanOfType'),
      'findFirstSpanOfType',
    ).mockReturnValue({
      id: 'completion-span-id',
      traceId: 'trace-id',
      spanType: SpanType.Completion,
      metadata: {
        input: [
          { role: 'user', content: [{ type: 'text', text: 'test input' }] },
        ],
        output: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'actual output' }],
          },
        ],
      },
    } as any)
  })

  it('fails when annotating is not supported for the evaluation', async () => {
    const otherEvaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      name: 'other evaluation',
    })
    mocks.publisher.mockClear()

    await expect(
      annotateEvaluationV2({
        resultScore: 1,
        evaluation: otherEvaluation,
        span,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Annotating is not supported for this evaluation'),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when evaluating a log that does not end with an assistant message', async () => {
    // Mock the span to return a conversation that doesn't end with assistant message
    vi.spyOn(
      await import('../tracing/spans/findFirstSpanOfType'),
      'findFirstSpanOfType',
    ).mockReturnValue({
      id: 'completion-span-id',
      traceId: 'trace-id',
      spanType: SpanType.Completion,
      metadata: {
        input: [
          { role: 'user', content: [{ type: 'text', text: 'test input' }] },
        ],
        output: [
          { role: 'user', content: [{ type: 'text', text: 'user message' }] },
        ], // Not assistant message
      },
    } as any)
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: 0,
        normalizedScore: 0,
        metadata: {
          reason: 'Conversation does not contain any assistant messages',
          actualOutput: '',
          configuration: evaluation.configuration,
        },
        hasPassed: false,
        error: null,
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
  })

  it('succeeds when extract actual output fails learnable', async () => {
    vi.spyOn(outputs, 'extractActualOutput').mockResolvedValue(
      Result.error(
        new UnprocessableEntityError(
          "Field 'arguments' is not present in the actual output",
        ),
      ),
    )
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: 0,
        normalizedScore: 0,
        metadata: {
          reason: "Field 'arguments' is not present in the actual output",
          actualOutput: '',
          configuration: evaluation.configuration,
        },
        hasPassed: false,
        error: null,
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: true,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when extract actual output fails non-learnable', async () => {
    vi.spyOn(outputs, 'extractActualOutput').mockResolvedValue(
      Result.error(new BadRequestError('Invalid message content filter')),
    )
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: null,
        normalizedScore: null,
        metadata: null,
        hasPassed: null,
        error: {
          message: 'Invalid message content filter',
        },
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: true,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when annotated result metadata is invalid', async () => {
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        // @ts-expect-error testing this
        reason: 1,
      },
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: null,
        normalizedScore: null,
        metadata: null,
        hasPassed: null,
        error: {
          message: z
            .object({
              reason: z.string(),
            })
            .safeParse({ reason: 1 }).error!.message,
        },
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: true,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when type and metric annotation fails', async () => {
    vi.spyOn(HumanEvaluationRatingSpecification, 'annotate').mockRejectedValue(
      new Error('metric annotation error'),
    )
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: null,
        normalizedScore: null,
        metadata: null,
        hasPassed: null,
        error: {
          message: 'metric annotation error',
        },
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: true,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when resulting normalized score is out of range', async () => {
    vi.spyOn(HumanEvaluationRatingSpecification, 'annotate').mockResolvedValue({
      score: 4,
      normalizedScore: 999,
      metadata: {
        reason: 'reason',
        actualOutput: 'actual output',
        configuration: evaluation.configuration,
      },
      hasPassed: true,
    })
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: null,
        normalizedScore: null,
        metadata: null,
        hasPassed: null,
        error: {
          message: `Normalized metric score must be between 0 and ${EVALUATION_SCORE_SCALE}`,
        },
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: true,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when actual output configuration is not set', async () => {
    evaluation.configuration.actualOutput = undefined as any
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: null,
        normalizedScore: null,
        metadata: null,
        hasPassed: null,
        error: {
          message:
            "Cannot read properties of undefined (reading 'contentFilter')",
        },
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: true,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when annotating a log with a score in range', async () => {
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: 4,
        normalizedScore: 75,
        metadata: {
          reason: 'reason',
          actualOutput: 'actual output',
          configuration: evaluation.configuration,
        },
        hasPassed: true,
        error: null,
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: true,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when annotating a log with a score out of range', async () => {
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: -8,
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: 1,
        normalizedScore: 0,
        metadata: {
          reason: undefined,
          actualOutput: 'actual output',
          configuration: evaluation.configuration,
        },
        hasPassed: false,
        error: null,
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: true,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when annotating a log already annotated', async () => {
    const { result: originalResult } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 2,
      evaluation: evaluation,
      span: span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        ...originalResult,
        score: 2,
        normalizedScore: 25,
        metadata: {
          reason: undefined,
          actualOutput: 'actual output',
          configuration: evaluation.configuration,
        },
        hasPassed: false,
        error: null,
        updatedAt: expect.any(Date),
      }),
    )
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Updated',
      data: {
        result: result,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: false,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('sends analytics event with userEmail null when updating existing annotation with same score but different reason', async () => {
    const { result: originalResult } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'original reason',
      },
      evaluation: evaluation,
      span: span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 4, // Same score
      resultMetadata: {
        reason: 'updated reason', // Different reason
      },
      evaluation: evaluation,
      span: span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        ...originalResult,
        score: 4, // Score unchanged
        normalizedScore: 75,
        metadata: {
          reason: 'updated reason',
          actualOutput: 'actual output',
          configuration: evaluation.configuration,
        },
        hasPassed: true,
        error: null,
        updatedAt: expect.any(Date),
      }),
    )
    // Should send both update and annotated events, but annotated event has userEmail: null
    // Analytics platform checks userEmail to decide whether to process the event
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Updated',
      data: {
        result: result,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: false,
        userEmail: null, // null because score didn't change, so analytics won't process it
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('sends analytics event when updating existing annotation with different score', async () => {
    const { result: originalResult } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'original reason',
      },
      evaluation: evaluation,
      span: span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 5, // Different score
      resultMetadata: {
        reason: 'updated reason',
      },
      evaluation: evaluation,
      span: span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        ...originalResult,
        score: 5,
        normalizedScore: 100,
        metadata: {
          reason: 'updated reason',
          actualOutput: 'actual output',
          configuration: evaluation.configuration,
        },
        hasPassed: true,
        error: null,
        updatedAt: expect.any(Date),
      }),
    )
    // Should send both update and annotated events (since score changed)
    expect(mocks.publisher).toHaveBeenCalledTimes(2)
    expect(mocks.publisher).toHaveBeenNthCalledWith(1, {
      type: 'evaluationResultV2Updated',
      data: {
        result: result,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        isNew: false,
        userEmail: null,
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })
})
