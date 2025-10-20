import { Providers } from '@latitude-data/constants'
import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { z } from 'zod'
import {
  EVALUATION_SCORE_SCALE,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
} from '../../constants'
import { publisher } from '../../events/publisher'
import * as helpers from '../../helpers'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { ProviderLogDto } from '../../schema/types'
import * as factories from '../../tests/factories'
import serializeProviderLog from '../providerLogs/serialize'
import { annotateEvaluationV2 } from './annotate'
import { HumanEvaluationRatingSpecification } from './human/rating'
import * as outputs from './outputs/extract'

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

  it('fails when evaluating a log that does not end with an assistant message', async () => {
    vi.spyOn(helpers, 'buildConversation').mockReturnValue([
      {
        role: MessageRole.user,
        content: [{ type: 'text', text: 'hi' }],
      },
    ])
    mocks.publisher.mockClear()

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

  it('succeeds when actual output configuration is not set', async () => {
    evaluation.configuration.actualOutput = undefined as any
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
