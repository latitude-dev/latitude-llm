import { ContentType, MessageRole } from '@latitude-data/compiler'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { z } from 'zod'
import {
  Commit,
  DocumentVersion,
  EVALUATION_SCORE_SCALE,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  Project,
  ProviderLogDto,
  Providers,
  User,
  Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import * as helpers from '../../helpers'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import serializeProviderLog from '../providerLogs/serialize'
import { annotateEvaluationV2 } from './annotate'
import { HumanEvaluationRatingSpecification } from './human/rating'

describe('annotateEvaluationV2', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let project: Project
  let user: User
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationV2<
    EvaluationType.Human,
    HumanEvaluationMetric.Rating
  >
  let providerLog: ProviderLogDto

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

    const { providerLogs: providerLogs } = await factories.createDocumentLog({
      document: document,
      commit: commit,
    })
    providerLog = serializeProviderLog(providerLogs.at(-1)!)

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  it('fails when evaluating a log that is from a different document', async () => {
    const { commit: draft } = await factories.createDraft({ project, user })

    const { documentVersion: differentDocument } =
      await factories.createDocumentVersion({
        commit: draft,
        path: 'other',
        content: factories.helpers.createPrompt({
          provider: 'openai',
          model: 'gpt-4o',
        }),
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
      annotateEvaluationV2({
        resultScore: 4,
        resultMetadata: {
          reason: 'reason',
        },
        evaluation: evaluation,
        providerLog: differentProviderLog,
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

    await expect(
      annotateEvaluationV2({
        resultScore: 4,
        resultMetadata: {
          reason: 'reason',
        },
        evaluation: evaluation,
        providerLog: providerLog,
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
        providerLog: providerLog,
        commit: commit,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new BadRequestError('Annotating is not supported for this evaluation'),
    )

    expect(mocks.publisher).not.toHaveBeenCalled()
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
      providerLog: providerLog,
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
        providerLog: providerLog,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        providerLog: providerLog,
      },
    })
  })

  it('succeeds when type and metric annotation fails', async () => {
    mocks.publisher.mockClear()

    vi.spyOn(HumanEvaluationRatingSpecification, 'annotate').mockRejectedValue(
      new Error('metric annotation error'),
    )

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      providerLog: providerLog,
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
        providerLog: providerLog,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
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
    mocks.publisher.mockClear()

    vi.spyOn(HumanEvaluationRatingSpecification, 'annotate').mockResolvedValue({
      score: 4,
      normalizedScore: 999,
      metadata: {
        reason: 'reason',
        actualOutput: providerLog.response,
        configuration: evaluation.configuration,
      },
      hasPassed: true,
    })

    const { result } = await annotateEvaluationV2({
      resultScore: 4,
      resultMetadata: {
        reason: 'reason',
      },
      evaluation: evaluation,
      providerLog: providerLog,
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
        providerLog: providerLog,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        providerLog: providerLog,
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
      providerLog: providerLog,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedLogId: providerLog.id,
        score: 4,
        normalizedScore: 75,
        metadata: {
          reason: 'reason',
          actualOutput: providerLog.response,
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
        providerLog: providerLog,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        providerLog: providerLog,
      },
    })
  })

  it('succeeds when annotating a log with a score out of range', async () => {
    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: -8,
      evaluation: evaluation,
      providerLog: providerLog,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(result).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
        evaluatedLogId: providerLog.id,
        score: 1,
        normalizedScore: 0,
        metadata: {
          reason: undefined,
          actualOutput: providerLog.response,
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
        providerLog: providerLog,
        workspaceId: workspace.id,
      },
    })
    expect(mocks.publisher).toHaveBeenNthCalledWith(2, {
      type: 'evaluationV2Annotated',
      data: {
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        providerLog: providerLog,
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
      providerLog: providerLog,
      commit: commit,
      workspace: workspace,
    }).then((r) => r.unwrap())

    mocks.publisher.mockClear()

    const { result } = await annotateEvaluationV2({
      resultScore: 2,
      evaluation: evaluation,
      providerLog: providerLog,
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
          actualOutput: providerLog.response,
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
        workspaceId: workspace.id,
        evaluation: evaluation,
        result: result,
        commit: commit,
        providerLog: providerLog,
      },
    })
  })
})
