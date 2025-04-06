import * as env from '@latitude-data/env'
import { subDays } from 'date-fns'
import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  Commit,
  ConnectedEvaluation,
  DOCUMENT_SUGGESTION_EXPIRATION_DAYS,
  DocumentVersion,
  EVALUATION_RESULT_RECENCY_DAYS,
  EvaluationDto,
  EvaluationMetadataType,
  EvaluationResultableType,
  EvaluationResultDto,
  MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION,
  Project,
  ProviderApiKey,
  User,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, UnprocessableEntityError } from '../../lib'
import { DocumentSuggestionsRepository } from '../../repositories'
import { evaluationResults } from '../../schema'
import * as factories from '../../tests/factories'
import * as copilot from '../copilot'
import { generateDocumentSuggestion } from './generate'

describe('generateDocumentSuggestion', () => {
  let mocks: {
    getCopilot: MockInstance
    runCopilot: MockInstance
    publisher: MockInstance
  }

  let workspace: Workspace
  let provider: ProviderApiKey
  let project: Project
  let user: User
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationDto
  let connected: ConnectedEvaluation
  let results: EvaluationResultDto[]

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetAllMocks()
    vi.restoreAllMocks()

    const {
      workspace: w,
      providers: ps,
      project: p,
      user: u,
    } = await factories.createProject()
    workspace = w
    provider = ps[0]!
    project = p
    user = u

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

    connected = await factories.createConnectedEvaluation({
      workspace: workspace,
      user: user,
      evaluationUuid: evaluation.uuid,
      documentUuid: document.documentUuid,
      live: true,
    })

    results = []
    for (
      let i = 0;
      i < MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION + 1;
      i++
    ) {
      const { documentLog } = await factories.createDocumentLog({
        document,
        commit,
      })

      const providerLog = await factories.createProviderLog({
        workspace: workspace,
        documentLogUuid: documentLog.uuid,
        providerId: provider.id,
        providerType: provider.provider,
      })

      const { evaluationResult } = await factories.createEvaluationResult({
        evaluation: evaluation,
        documentLog: documentLog,
        evaluatedProviderLog: providerLog,
        result: (100 - i).toString(),
      })
      results.push(evaluationResult)
    }

    vi.spyOn(env, 'env', 'get').mockReturnValue({
      ...env.env,
      LATITUDE_CLOUD: true,
      COPILOT_REFINE_PROMPT_PATH: 'refiner',
    })

    mocks = {
      getCopilot: vi
        .spyOn(copilot, 'getCopilot')
        .mockImplementation(async (_) => {
          return Result.ok({ workspace, commit, document })
        }),
      runCopilot: vi
        .spyOn(copilot, 'runCopilot')
        .mockImplementation(async (_) => {
          return Result.ok({
            prompt: 'suggested prompt',
            summary: 'generated summary',
          })
        }),
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  it('not generates document suggestion when evaluation not available', async () => {
    const anotherEvaluation = await factories.createEvaluation({
      workspace: workspace,
      user: user,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
    })
    mocks.publisher.mockClear()

    await expect(
      generateDocumentSuggestion({
        workspace: workspace,
        commit: commit,
        document: document,
        evaluation: { ...anotherEvaluation, version: 'v1' },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Suggestions not available for this evaluation',
      ),
    )

    const repository = new DocumentSuggestionsRepository(workspace.id)
    const suggestions = await repository
      .listByDocumentVersionWithDetails({ commit, document })
      .then((r) => r.unwrap())
    expect(suggestions).toEqual([])
    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).not.toHaveBeenCalled()
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('not generates document suggestion when evaluation not live', async () => {
    connected = await factories.modifyConnectedEvaluation({
      evaluation: connected,
      live: false,
    })

    await expect(
      generateDocumentSuggestion({
        workspace: workspace,
        commit: commit,
        document: document,
        evaluation: { ...evaluation, version: 'v1' },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Suggestions not available for this evaluation',
      ),
    )

    const repository = new DocumentSuggestionsRepository(workspace.id)
    const suggestions = await repository
      .listByDocumentVersionWithDetails({ commit, document })
      .then((r) => r.unwrap())
    expect(suggestions).toEqual([])
    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).not.toHaveBeenCalled()
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('not generates document suggestion when limits are exceeded', async () => {
    const anotherSuggestion = await factories.createDocumentSuggestion({
      commit: commit,
      document: document,
      evaluation: { ...evaluation, version: 'v1' },
      workspace: workspace,
    })
    mocks.publisher.mockClear()

    await expect(
      generateDocumentSuggestion({
        workspace: workspace,
        commit: commit,
        document: document,
        evaluation: { ...evaluation, version: 'v1' },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError(
        'Maximum suggestions reached for this evaluation',
      ),
    )

    const repository = new DocumentSuggestionsRepository(workspace.id)
    const suggestions = await repository
      .listByDocumentVersionWithDetails({ commit, document })
      .then((r) => r.unwrap())
    expect(suggestions).toEqual([
      expect.objectContaining({ id: anotherSuggestion.id }),
    ])
    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).not.toHaveBeenCalled()
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('not generates document suggestion when not enough results available', async () => {
    await database.update(evaluationResults).set({
      updatedAt: subDays(new Date(), EVALUATION_RESULT_RECENCY_DAYS + 1),
    })

    await expect(
      generateDocumentSuggestion({
        workspace: workspace,
        commit: commit,
        document: document,
        evaluation: { ...evaluation, version: 'v1' },
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Not enough evaluation results found'),
    )

    const repository = new DocumentSuggestionsRepository(workspace.id)
    const suggestions = await repository
      .listByDocumentVersionWithDetails({ commit, document })
      .then((r) => r.unwrap())
    expect(suggestions).toEqual([])
    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).not.toHaveBeenCalled()
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('not generates document suggestion when results are invalid', async () => {
    results = results.map((r) => ({ ...r, result: undefined }))

    await expect(
      generateDocumentSuggestion({
        workspace: workspace,
        commit: commit,
        document: document,
        evaluation: { ...evaluation, version: 'v1' },
        results: results.map((result) => ({ ...result, version: 'v1' })),
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new UnprocessableEntityError('Cannot use these results for a suggestion'),
    )

    const repository = new DocumentSuggestionsRepository(workspace.id)
    const suggestions = await repository
      .listByDocumentVersionWithDetails({ commit, document })
      .then((r) => r.unwrap())
    expect(suggestions).toEqual([])
    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).not.toHaveBeenCalled()
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('generates document suggestion when there are none', async () => {
    const { suggestion } = await generateDocumentSuggestion({
      workspace: workspace,
      commit: commit,
      document: document,
      evaluation: { ...evaluation, version: 'v1' },
    }).then((r) => r.unwrap())

    const repository = new DocumentSuggestionsRepository(workspace.id)
    const suggestions = await repository
      .listByDocumentVersionWithDetails({ commit, document })
      .then((r) => r.unwrap())

    expect(suggestion).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        evaluationId: evaluation.id,
        oldPrompt: document.content,
        newPrompt: 'suggested prompt',
        summary: 'generated summary',
      }),
    )
    expect(suggestions).toEqual([
      expect.objectContaining({ id: suggestion.id }),
    ])
    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).toHaveBeenLastCalledWith({
      copilot: expect.any(Object),
      parameters: {
        prompt: document.content,
        evaluation: (evaluation.metadata as any).prompt,
        results: results
          .sort((a, b) => Number(a.result) - Number(b.result))
          .map((r) => expect.objectContaining({ result: Number(r.result) }))
          .slice(0, MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION),
      },
    })
    expect(mocks.publisher).toHaveBeenLastCalledWith({
      type: 'documentSuggestionCreated',
      data: {
        workspaceId: workspace.id,
        suggestion: suggestion,
        evaluation: { ...evaluation, version: 'v1' },
      },
    })
  })

  it('generates document suggestion when another are expired', async () => {
    await factories.createDocumentSuggestion({
      commit: commit,
      document: document,
      evaluation: { ...evaluation, version: 'v1' },
      workspace: workspace,
      prompt: 'another prompt',
      summary: 'another summary',
      createdAt: subDays(new Date(), DOCUMENT_SUGGESTION_EXPIRATION_DAYS + 1),
    })
    mocks.publisher.mockClear()

    const { suggestion } = await generateDocumentSuggestion({
      workspace: workspace,
      commit: commit,
      document: document,
      evaluation: { ...evaluation, version: 'v1' },
    }).then((r) => r.unwrap())

    const repository = new DocumentSuggestionsRepository(workspace.id)
    const suggestions = await repository
      .listByDocumentVersionWithDetails({ commit, document })
      .then((r) => r.unwrap())

    expect(suggestion).toEqual(
      expect.objectContaining({
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        evaluationId: evaluation.id,
        oldPrompt: document.content,
        newPrompt: 'suggested prompt',
        summary: 'generated summary',
      }),
    )
    expect(suggestions).toEqual([
      expect.objectContaining({ id: suggestion.id }),
    ])
    expect(mocks.getCopilot).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).toHaveBeenCalledOnce()
    expect(mocks.runCopilot).toHaveBeenLastCalledWith({
      copilot: expect.any(Object),
      parameters: {
        prompt: document.content,
        evaluation: (evaluation.metadata as any).prompt,
        results: results
          .sort((a, b) => Number(a.result) - Number(b.result))
          .map((r) => expect.objectContaining({ result: Number(r.result) }))
          .slice(0, MAX_EVALUATION_RESULTS_PER_DOCUMENT_SUGGESTION),
      },
    })
    expect(mocks.publisher).toHaveBeenLastCalledWith({
      type: 'documentSuggestionCreated',
      data: {
        workspaceId: workspace.id,
        suggestion: suggestion,
        evaluation: { ...evaluation, version: 'v1' },
      },
    })
  })
})
