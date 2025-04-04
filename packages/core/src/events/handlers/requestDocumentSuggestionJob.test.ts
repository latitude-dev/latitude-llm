import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DocumentLog,
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultDto,
  LogSources,
  Workspace,
} from '../../browser'
import { defaultQueue } from '../../jobs/queues'
import * as factories from '../../tests/factories'
import { requestDocumentSuggestionJob } from './requestDocumentSuggestionJob'

describe('requestDocumentSuggestionJob', () => {
  const mocks = vi.hoisted(() => ({
    defaultQueue: vi.fn(),
  }))

  let workspace: Workspace
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

    const commit = await factories.createCommit({
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
    const document = d

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

    vi.spyOn(defaultQueue, 'add').mockImplementation(mocks.defaultQueue)
  })

  it('not enqueues generate suggestion job when result is not live', async () => {
    documentLog.source = LogSources.API
    result.source = LogSources.API

    await requestDocumentSuggestionJob({
      data: {
        type: 'evaluationResultCreated',
        data: {
          workspaceId: workspace.id,
          evaluationResult: result,
          evaluation: evaluation,
          documentLog: documentLog,
        },
      },
    })

    expect(mocks.defaultQueue).not.toHaveBeenCalled()
  })

  it('not enqueues generate suggestion job when result has passed', async () => {
    result.result = (evaluation.resultConfiguration as any).maxValue

    await requestDocumentSuggestionJob({
      data: {
        type: 'evaluationResultCreated',
        data: {
          workspaceId: workspace.id,
          evaluationResult: result,
          evaluation: evaluation,
          documentLog: documentLog,
        },
      },
    })

    expect(mocks.defaultQueue).not.toHaveBeenCalled()
  })

  it('enqueues generate suggestion job', async () => {
    await requestDocumentSuggestionJob({
      data: {
        type: 'evaluationResultCreated',
        data: {
          workspaceId: workspace.id,
          evaluationResult: result,
          evaluation: evaluation,
          documentLog: documentLog,
        },
      },
    })

    expect(mocks.defaultQueue).toHaveBeenCalledOnce()
    expect(mocks.defaultQueue).toHaveBeenCalledWith(
      'generateDocumentSuggestionJob',
      {
        workspaceId: workspace.id,
        commitId: documentLog.commitId,
        documentUuid: documentLog.documentUuid,
        evaluationId: result.evaluationId,
      },
      { attempts: 1, deduplication: { id: expect.any(String) } },
    )
  })
})
