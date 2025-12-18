import { Providers, SpanType, SpanWithDetails } from '@latitude-data/constants'
import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  DEFAULT_DATASET_LABEL,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  RuleEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { type Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DatasetRow } from '../../schema/models/types/DatasetRow'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Experiment } from '../../schema/models/types/Experiment'
import { type User } from '../../schema/models/types/User'
import { WorkspaceDto } from '../../schema/models/types/Workspace'
import * as factories from '../../tests/factories'
import { getColumnData } from '../datasets/utils'
import * as outputs from './outputs/extract'
import { RuleEvaluationExactMatchSpecification } from './rule/exactMatch'
import { RuleEvaluationRegularExpressionSpecification } from './rule/regularExpression'
import { runEvaluationV2 } from './run'

describe('runEvaluationV2', () => {
  let mocks: {
    publisher: MockInstance
  }

  let apiKeys: any[]
  let span: SpanWithDetails<SpanType.Prompt>
  let workspace: WorkspaceDto
  let user: User
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >
  let experiment: Experiment
  let dataset: Dataset
  let datasetLabel: string
  let datasetRow: DatasetRow

  beforeEach(async () => {
    vi.resetAllMocks()
    vi.clearAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      user: u,
      documents,
      commit: c,
      apiKeys: aks,
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
    user = u
    commit = c
    document = documents[0]!
    apiKeys = aks

    evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
    })

    span = (await factories.createSpan({
      workspaceId: workspace.id,
      commitUuid: commit.uuid,
      apiKeyId: apiKeys[0]!.id,
    })) as SpanWithDetails<SpanType.Prompt>

    datasetLabel = DEFAULT_DATASET_LABEL
    const { dataset: d } = await factories.createDataset({
      author: user,
      fileContent: `
param1,param2,${DEFAULT_DATASET_LABEL}
value1,value2,value3
`.trim(),
      workspace: workspace,
    })
    dataset = d

    datasetRow = await factories.createDatasetRow({
      dataset: dataset,
      columns: dataset.columns,
      workspace: workspace,
    })

    const { experiment: e } = await factories.createExperiment({
      document: document,
      commit: commit,
      evaluations: [evaluation],
      dataset: dataset,
      datasetLabels: { [evaluation.uuid]: datasetLabel },
      user: user,
      workspace: workspace,
    })
    experiment = e

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }

    // Mock findCompletionSpanFromTrace to return a completion span by default
    vi.spyOn(
      await import('../tracing/spans/findCompletionSpanFromTrace'),
      'findCompletionSpanFromTrace',
    ).mockReturnValue({
      id: 'completion-span-id',
      traceId: span.traceId,
      type: SpanType.Completion,
      metadata: {
        input: [{ role: 'user', content: 'test input' }],
        output: [{ role: 'assistant', content: 'test output' }],
      },
    } as any)

    vi.spyOn(
      await import('../tracing/traces/assemble'),
      'assembleTraceWithMessages',
    ).mockResolvedValue(
      Result.ok({
        trace: {
          id: span.traceId,
          children: [
            {
              id: 'prompt-span-id',
              traceId: span.traceId,
              type: SpanType.Prompt,
              children: [
                {
                  id: 'completion-span-id',
                  traceId: span.traceId,
                  type: SpanType.Completion,
                  metadata: {
                    input: [{ role: 'user', content: 'test input' }],
                    output: [{ role: 'assistant', content: 'test output' }],
                  },
                },
              ],
              metadata: {
                input: [{ role: 'user', content: 'test input' }],
              },
            },
          ],
          spans: 2,
          duration: 1000,
          startedAt: new Date(),
          endedAt: new Date(),
        },
        completionSpan: {
          id: 'completion-span-id',
          traceId: span.traceId,
          type: SpanType.Completion,
          metadata: {
            input: [{ role: 'user', content: 'test input' }],
            output: [{ role: 'assistant', content: 'test output' }],
          },
        },
      }) as any,
    )
  })

  it('fails when evaluating a log that is already evaluated for this evaluation', async () => {
    await factories.createEvaluationResultV2({
      evaluation: evaluation,
      span: span,
      commit: commit,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
      workspace: workspace,
    })
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: evaluation,
        span: span,
        experiment: experiment,
        dataset: dataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot evaluate a log that is already evaluated for this evaluation',
      ),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when running is not supported for the evaluation', async () => {
    const otherEvaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      name: 'other evaluation',
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
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: otherEvaluation,
        span: span,
        experiment: experiment,
        dataset: dataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Running is not supported for this evaluation'),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when evaluating a row that is from a different dataset', async () => {
    const { dataset: anotherDataset } = await factories.createDataset({
      author: user,
      fileContent: `
  param1,param2,${DEFAULT_DATASET_LABEL}
  value1,value2,value3
  `.trim(),
      workspace: workspace,
    })
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: evaluation,
        span: span,
        experiment: experiment,
        dataset: anotherDataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot evaluate a row that is from a different dataset',
      ),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when expected output is required but dataset data is not provided', async () => {
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: evaluation,
        span: span,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot evaluate a log without a dataset, label, row or configuration when expected output is required',
      ),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when expected output is required but configuration is not provided', async () => {
    evaluation.configuration.expectedOutput = undefined
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: evaluation,
        span: span,
        experiment: experiment,
        dataset: dataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot evaluate a log without a dataset, label, row or configuration when expected output is required',
      ),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when type and metric run fails and error is retryable', async () => {
    // Mock findCompletionSpanFromTrace to return a completion span
    vi.doMock('../tracing/spans/findCompletionSpanFromTrace', () => ({
      findCompletionSpanFromTrace: vi.fn().mockReturnValue({
        id: 'completion-span-id',
        traceId: span.traceId,
        type: SpanType.Completion,
        metadata: {
          input: [{ role: 'user', content: 'test input' }],
          output: [{ role: 'assistant', content: 'test output' }],
        },
      }),
    }))

    vi.spyOn(RuleEvaluationExactMatchSpecification, 'run').mockRejectedValue(
      new ChainError({
        code: RunErrorCodes.RateLimit,
        message: 'rate limited!',
      }),
    )
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: evaluation,
        span: span,
        experiment: experiment,
        dataset: dataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ChainError({
        code: RunErrorCodes.RateLimit,
        message: 'rate limited!',
      }),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('succeeds when extract actual output fails learnable', async () => {
    vi.spyOn(outputs, 'extractActualOutput').mockReturnValue(
      Result.error(
        new UnprocessableEntityError(
          "Field 'arguments' is not present in the actual output",
        ),
      ),
    )
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      span: span,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
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
          configuration: evaluation.configuration,
          actualOutput: '',
          expectedOutput: getColumnData({
            dataset: dataset,
            row: datasetRow,
            column: datasetLabel,
          }),
          datasetLabel: datasetLabel,
          reason: "Field 'arguments' is not present in the actual output",
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
        experiment: experiment,
        dataset: dataset,
        datasetRow: datasetRow,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Ran',
      data: {
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
    vi.spyOn(outputs, 'extractActualOutput').mockReturnValue(
      Result.error(new BadRequestError('Invalid message content filter')),
    )
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      span: span,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
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
        experiment: experiment,
        dataset: dataset,
        datasetRow: datasetRow,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Ran',
      data: {
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when extract expected output fails', async () => {
    vi.spyOn(outputs, 'extractExpectedOutput').mockReturnValue(
      // @ts-expect-error - mock
      Result.error(new UnprocessableEntityError('Expected output is required')),
    )
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      span: span,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
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
          message: 'Expected output is required',
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
        experiment: experiment,
        dataset: dataset,
        datasetRow: datasetRow,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Ran',
      data: {
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when type and metric run fails and error is not retryable', async () => {
    vi.spyOn(RuleEvaluationExactMatchSpecification, 'run').mockRejectedValue(
      new Error('metric run error'),
    )
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      span: span,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
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
          message: 'metric run error',
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
        experiment: experiment,
        dataset: dataset,
        datasetRow: datasetRow,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Ran',
      data: {
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
    vi.spyOn(RuleEvaluationExactMatchSpecification, 'run').mockResolvedValue({
      score: 1,
      normalizedScore: 999,
      metadata: {
        configuration: evaluation.configuration,
        actualOutput: 'actualOutput',
        expectedOutput: 'expectedOutput',
        datasetLabel: datasetLabel,
      },
      hasPassed: true,
    })
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      span: span,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
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
          message: 'Normalized metric score must be between 0 and 100',
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
        experiment: experiment,
        dataset: dataset,
        datasetRow: datasetRow,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Ran',
      data: {
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

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      span: span,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
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
        experiment: experiment,
        dataset: dataset,
        datasetRow: datasetRow,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Ran',
      data: {
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when running an evaluation in live', async () => {
    const liveEvaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      name: 'live evaluation',
      type: EvaluationType.Rule,
      metric: RuleEvaluationMetric.RegularExpression,
      configuration: {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        pattern: 'pattern',
      },
    })
    vi.spyOn(
      RuleEvaluationRegularExpressionSpecification,
      'run',
    ).mockResolvedValue({
      score: 1,
      normalizedScore: 100,
      metadata: {
        configuration: liveEvaluation.configuration,
        actualOutput: 'actualOutput',
      },
      hasPassed: true,
    })
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: liveEvaluation,
      span: span,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: liveEvaluation.uuid,
        evaluatedSpanId: span.id,
        evaluatedTraceId: span.traceId,
        score: 1,
        normalizedScore: 100,
        metadata: {
          configuration: liveEvaluation.configuration,
          actualOutput: 'actualOutput',
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
        evaluation: liveEvaluation,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Ran',
      data: {
        workspaceId: workspace.id,
        evaluation: liveEvaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when running an evaluation in batch', async () => {
    vi.spyOn(RuleEvaluationExactMatchSpecification, 'run').mockResolvedValue({
      score: 0,
      normalizedScore: 0,
      metadata: {
        configuration: evaluation.configuration,
        actualOutput: 'actualOutput',
        expectedOutput: 'expectedOutput',
        datasetLabel: datasetLabel,
      },
      hasPassed: false,
    })
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      span: span,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
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
          configuration: evaluation.configuration,
          actualOutput: 'actualOutput',
          expectedOutput: 'expectedOutput',
          datasetLabel: datasetLabel,
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
        experiment: experiment,
        dataset: dataset,
        datasetRow: datasetRow,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Ran',
      data: {
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        spanId: span.id,
        traceId: span.traceId,
      },
    })
  })

  it('succeeds when running an evaluation in dry mode', async () => {
    vi.spyOn(RuleEvaluationExactMatchSpecification, 'run').mockResolvedValue({
      score: 0,
      normalizedScore: 0,
      metadata: {
        configuration: evaluation.configuration,
        actualOutput: 'actualOutput',
        expectedOutput: 'expectedOutput',
        datasetLabel: datasetLabel,
      },
      hasPassed: false,
    })
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      span: span,
      experiment: experiment,
      dataset: dataset,
      datasetLabel: datasetLabel,
      datasetRow: datasetRow,
      commit: commit,
      workspace: workspace,
      dry: true,
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
          configuration: evaluation.configuration,
          actualOutput: 'actualOutput',
          expectedOutput: 'expectedOutput',
          datasetLabel: datasetLabel,
        },
        hasPassed: false,
        // error: null, // Note: error not set because it didn't persist
      }),
    )
    expect(mocks.publisher).not.toHaveBeenCalled()
  })
})
