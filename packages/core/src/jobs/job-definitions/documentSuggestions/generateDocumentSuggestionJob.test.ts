import * as env from '@latitude-data/env'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  Commit,
  DocumentLog,
  DocumentVersion,
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultDto,
  LogSources,
  Workspace,
} from '../../../browser'
import * as services from '../../../services/documentSuggestions'
import * as factories from '../../../tests/factories'
import { generateDocumentSuggestionJob } from './generateDocumentSuggestionJob'
import { Result } from './../../../lib/Result'
import { UnprocessableEntityError } from './../../../lib/errors'

describe('generateDocumentSuggestionJob', () => {
  let mocks: {
    generateDocumentSuggestion: MockInstance
  }

  let workspace: Workspace
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationDto
  let result: EvaluationResultDto
  let documentLog: DocumentLog

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      providers,
      project,
      user,
    } = await factories.createProject()
    workspace = w
    const provider = providers[0]!

    commit = await factories.createCommit({
      projectId: project.id,
      user: user,
    })

    const { documentVersion: d } = await factories.createDocumentVersion({
      workspace: workspace,
      user: user,
      commit: commit,
      path: 'prompt',
      content: factories.helpers.createPrompt({ provider }),
    })
    document = d

    evaluation = await factories.createEvaluation({
      workspace: workspace,
      user: user,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })

    await factories.createConnectedEvaluation({
      workspace: workspace,
      user: user,
      evaluationUuid: evaluation.uuid,
      documentUuid: document.documentUuid,
      live: true,
    })

    const { documentLog: l } = await factories.createDocumentLog({
      document,
      commit,
      source: LogSources.Playground,
    })
    documentLog = l

    const providerLog = await factories.createProviderLog({
      workspace: workspace,
      documentLogUuid: documentLog.uuid,
      providerId: provider.id,
      providerType: provider.provider,
    })

    const { evaluationResult: r } = await factories.createEvaluationResult({
      evaluation: evaluation,
      documentLog: documentLog,
      evaluatedProviderLog: providerLog,
      result: '31',
    })
    result = r

    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: true,
    })

    mocks = {
      generateDocumentSuggestion: vi
        .spyOn(services, 'generateDocumentSuggestion')
        .mockImplementation(vi.fn()),
    }
  })

  it('raises error when fails and not unprocessable', async () => {
    mocks.generateDocumentSuggestion.mockResolvedValue(
      Result.error(new Error('failed!')),
    )

    await expect(
      generateDocumentSuggestionJob({
        data: {
          workspaceId: workspace.id,
          commitId: commit.id,
          documentUuid: documentLog.documentUuid,
          evaluationId: result.evaluationId,
        },
      } as any),
    ).rejects.toThrowError(new Error('failed!'))

    expect(mocks.generateDocumentSuggestion).toHaveBeenCalledOnce()
    expect(mocks.generateDocumentSuggestion).toHaveBeenCalledWith({
      workspace: expect.objectContaining({ id: workspace.id }),
      commit: expect.objectContaining({ id: commit.id }),
      document: expect.objectContaining({ id: document.id }),
      evaluation: expect.objectContaining({ id: evaluation.id }),
    })
  })

  it('fails silently when unprocessable', async () => {
    mocks.generateDocumentSuggestion.mockResolvedValue(
      Result.error(new UnprocessableEntityError('failed!')),
    )

    await generateDocumentSuggestionJob({
      data: {
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: documentLog.documentUuid,
        evaluationId: result.evaluationId,
      },
    } as any)

    expect(mocks.generateDocumentSuggestion).toHaveBeenCalledOnce()
    expect(mocks.generateDocumentSuggestion).toHaveBeenCalledWith({
      workspace: expect.objectContaining({ id: workspace.id }),
      commit: expect.objectContaining({ id: commit.id }),
      document: expect.objectContaining({ id: document.id }),
      evaluation: expect.objectContaining({ id: evaluation.id }),
    })
  })

  it('generates suggestion', async () => {
    mocks.generateDocumentSuggestion.mockResolvedValue(Result.nil())

    await generateDocumentSuggestionJob({
      data: {
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: documentLog.documentUuid,
        evaluationId: result.evaluationId,
      },
    } as any)

    expect(mocks.generateDocumentSuggestion).toHaveBeenCalledOnce()
    expect(mocks.generateDocumentSuggestion).toHaveBeenCalledWith({
      workspace: expect.objectContaining({ id: workspace.id }),
      commit: expect.objectContaining({ id: commit.id }),
      document: expect.objectContaining({ id: document.id }),
      evaluation: expect.objectContaining({ id: evaluation.id }),
    })
  })
})
