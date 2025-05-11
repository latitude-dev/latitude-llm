import { ContentType, MessageRole } from '@latitude-data/compiler'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  Commit,
  Dataset,
  DatasetRow,
  DEFAULT_DATASET_LABEL,
  DocumentVersion,
  EvaluationType,
  EvaluationV2,
  Experiment,
  HumanEvaluationMetric,
  Project,
  ProviderLogDto,
  Providers,
  RuleEvaluationMetric,
  User,
  Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import * as helpers from '../../helpers'
import { ChainError } from '../../lib/chainStreamManager/ChainErrors'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import serializeProviderLog from '../providerLogs/serialize'
import { RuleEvaluationExactMatchSpecification } from './rule/exactMatch'
import { RuleEvaluationRegularExpressionSpecification } from './rule/regularExpression'
import { runEvaluationV2 } from './run'

describe('runEvaluationV2', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let project: Project
  let user: User
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<
    EvaluationType.Rule,
    RuleEvaluationMetric.ExactMatch
  >
  let providerLog: ProviderLogDto
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
      project: p,
      user: u,
      documents,
      commit: c,
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
    project = p
    user = u
    commit = c
    document = documents[0]!

    evaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
    })

    const { providerLogs: providerLogs } = await factories.createDocumentLog({
      document: document,
      commit: commit,
    })
    providerLog = serializeProviderLog(providerLogs.at(-1)!)

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
  })

  it('fails when evaluating a log that is already evaluated for this evaluation', async () => {
    await factories.createEvaluationResultV2({
      evaluation: evaluation,
      providerLog: providerLog,
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
        providerLog: providerLog,
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

  it('fails when evaluating a log that is from a different document', async () => {
    const { commit: draft } = await factories.createDraft({ project, user })
    const { documentVersion: differentDocument } =
      await factories.createDocumentVersion({
        commit: draft,
        path: 'other',
        content: factories.helpers.createPrompt({ provider: 'openai' }),
        user: user,
        workspace: workspace,
      })
    const { providerLogs: providerLogs } = await factories.createDocumentLog({
      document: differentDocument,
      commit: draft,
    })
    const differentProviderLog = serializeProviderLog(providerLogs.at(-1)!)
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: evaluation,
        providerLog: differentProviderLog,
        experiment: experiment,
        dataset: dataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot evaluate a log that is from a different document',
      ),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when evaluating a log that does not end with an assistant message', async () => {
    vi.spyOn(helpers, 'buildConversation').mockReturnValue([
      {
        role: MessageRole.user,
        content: [{ type: ContentType.text, text: 'hi' }],
      },
    ])
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: evaluation,
        providerLog: providerLog,
        experiment: experiment,
        dataset: dataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Cannot evaluate a log that does not end with an assistant message',
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
        providerLog: providerLog,
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

  it('fails when experiment and row is not part of the dataset', async () => {
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
        providerLog: providerLog,
        experiment: experiment,
        dataset: anotherDataset,
        datasetLabel: datasetLabel,
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Row is not part of the dataset'),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when experiment and labeled column not found in dataset', async () => {
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: evaluation,
        providerLog: providerLog,
        experiment: experiment,
        dataset: dataset,
        datasetLabel: 'other',
        datasetRow: datasetRow,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError(`other column not found in dataset`),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when expected output is required but not provided', async () => {
    mocks.publisher.mockClear()

    await expect(
      runEvaluationV2({
        evaluation: evaluation,
        providerLog: providerLog,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new BadRequestError(`Expected output is required`))

    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('fails when type and metric run fails and error is retryable', async () => {
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
        providerLog: providerLog,
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

  it('succeeds when type and metric run fails and error is not retryable', async () => {
    vi.spyOn(RuleEvaluationExactMatchSpecification, 'run').mockRejectedValue(
      new Error('metric run error'),
    )
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      providerLog: providerLog,
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
        evaluatedLogId: providerLog.id,
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
        providerLog: providerLog,
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
        providerLog: providerLog,
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
      providerLog: providerLog,
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
        evaluatedLogId: providerLog.id,
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
        providerLog: providerLog,
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
        providerLog: providerLog,
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
      providerLog: providerLog,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: liveEvaluation.uuid,
        evaluatedLogId: providerLog.id,
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
        providerLog: providerLog,
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
        providerLog: providerLog,
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
      hasPassed: true,
    })
    mocks.publisher.mockClear()

    const { result } = await runEvaluationV2({
      evaluation: evaluation,
      providerLog: providerLog,
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
        evaluatedLogId: providerLog.id,
        score: 0,
        normalizedScore: 0,
        metadata: {
          configuration: evaluation.configuration,
          actualOutput: 'actualOutput',
          expectedOutput: 'expectedOutput',
          datasetLabel: datasetLabel,
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
        providerLog: providerLog,
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
        providerLog: providerLog,
      },
    })
  })
})
