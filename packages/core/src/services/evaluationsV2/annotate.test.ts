import { ContentType, MessageRole } from '@latitude-data/compiler'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import * as helpers from '../../helpers'
import { BadRequestError, UnprocessableEntityError } from '../../lib/errors'
import * as factories from '../../tests/factories'
import serializeProviderLog from '../providerLogs/serialize'
import { annotateEvaluationV2 } from './annotate'
import { HumanEvaluationRatingSpecification } from './human/rating'

describe('annotateEvaluationV2', () => {
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
  })

  it('fails when annotating is not supported for the evaluation', async () => {
    const otherEvaluation = await factories.createEvaluationV2({
      document: document,
      commit: commit,
      workspace: workspace,
      name: 'other evaluation',
    })

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
  })

  it('fails when annotated result metadata is invalid', async () => {
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
  })

  it('fails when type and metric annotation fails', async () => {
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
  })

  it('fails when resulting normalized score is out of range', async () => {
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
  })

  it('succeeds when annotating a log with a score in range', async () => {
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
  })

  it('succeeds when annotating a log with a score out of range', async () => {
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
  })
})
