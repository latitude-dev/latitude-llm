import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  DocumentLog,
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultDto,
  LogSources,
  Workspace,
} from '../../browser'
import * as jobs from '../../jobs'
import * as factories from '../../tests/factories'
import { requestDocumentSuggestionJob } from './requestDocumentSuggestionJob'

describe('requestDocumentSuggestionJob', () => {
  let mocks: {
    enqueueGenerateDocumentSuggestionJob: MockInstance
  }

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

    mocks = { enqueueGenerateDocumentSuggestionJob: vi.fn() }
    vi.spyOn(jobs, 'setupJobs').mockResolvedValue({
      defaultQueue: {
        jobs: {
          enqueueGenerateDocumentSuggestionJob:
            mocks.enqueueGenerateDocumentSuggestionJob,
        },
      },
    } as any)
  })

  it('not enqueues generate suggestion job when result is not from playground', async () => {
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

    expect(mocks.enqueueGenerateDocumentSuggestionJob).not.toHaveBeenCalled()
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

    expect(mocks.enqueueGenerateDocumentSuggestionJob).not.toHaveBeenCalled()
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

    expect(mocks.enqueueGenerateDocumentSuggestionJob).toHaveBeenCalledOnce()
    expect(mocks.enqueueGenerateDocumentSuggestionJob).toHaveBeenCalledWith(
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
