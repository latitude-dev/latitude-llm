import { beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import {
  Commit,
  DocumentSuggestion,
  DocumentVersion,
  EvaluationDto,
  EvaluationMetadataType,
  Project,
  ProviderApiKey,
  User,
  Workspace,
} from '../../browser'
import { publisher } from '../../events/publisher'
import { NotFoundError, Result } from '../../lib'
import {
  DocumentSuggestionsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits/merge'
import { applyDocumentSuggestion } from './apply'

describe('applyDocumentSuggestion', () => {
  let mocks: {
    publisher: MockInstance
  }

  let workspace: Workspace
  let provider: ProviderApiKey
  let project: Project
  let user: User
  let commit: Commit
  let document: DocumentVersion
  let evaluation: EvaluationDto
  let suggestion: DocumentSuggestion

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
    })

    await factories.createConnectedEvaluation({
      workspace: workspace,
      user: user,
      evaluationUuid: evaluation.uuid,
      documentUuid: document.documentUuid,
    })

    suggestion = await factories.createDocumentSuggestion({
      commit: commit,
      document: document,
      evaluation: { ...evaluation, version: 'v1' },
      workspace: workspace,
      prompt: 'suggested prompt',
    })

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  it('not applies document suggestion when fails', async () => {
    commit = await mergeCommit(commit).then((r) => r.unwrap())

    vi.spyOn(
      await import('../commits/create'),
      'createCommit',
    ).mockResolvedValue(Result.error(new Error('failed!')))

    await expect(
      applyDocumentSuggestion({
        suggestion: suggestion,
        commit: commit,
        workspace: workspace,
        project: project,
        user: user,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(new Error(`failed!`))

    const repository = new DocumentSuggestionsRepository(workspace.id)
    const actual = await repository.find(suggestion.id).then((r) => r.unwrap())
    expect(actual).toEqual(suggestion)
    expect(mocks.publisher).not.toHaveBeenCalled()
  })

  it('applies document suggestion on draft commit', async () => {
    const result = await applyDocumentSuggestion({
      suggestion: suggestion,
      commit: commit,
      workspace: workspace,
      project: project,
      user: user,
    }).then((r) => r.unwrap())

    expect(result).toEqual({ suggestion })
    const repository = new DocumentSuggestionsRepository(workspace.id)
    await expect(
      repository.find(suggestion.id).then((r) => r.unwrap()),
    ).rejects.toThrowError(NotFoundError)
    expect(mocks.publisher).toHaveBeenLastCalledWith({
      type: 'documentSuggestionApplied',
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        suggestion: suggestion,
      },
    })
  })

  it('applies document suggestion on merged commit', async () => {
    commit = await mergeCommit(commit).then((r) => r.unwrap())

    const result = await applyDocumentSuggestion({
      suggestion: suggestion,
      commit: commit,
      workspace: workspace,
      project: project,
      user: user,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      suggestion,
      draft: expect.objectContaining({
        title: `Refined 'prompt'`,
        description: 'Created by a suggestion.',
        mergedAt: null,
      }),
    })
    const suggestionsRepository = new DocumentSuggestionsRepository(
      workspace.id,
    )
    await expect(
      suggestionsRepository.find(suggestion.id).then((r) => r.unwrap()),
    ).rejects.toThrowError(NotFoundError)
    const documentsRepository = new DocumentVersionsRepository(workspace.id)
    document = await documentsRepository
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: result.draft!.uuid,
        documentUuid: result.suggestion.documentUuid,
      })
      .then((r) => r.unwrap())
    expect(document.content).toEqual(suggestion.newPrompt)
    expect(mocks.publisher).toHaveBeenLastCalledWith({
      type: 'documentSuggestionApplied',
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        suggestion: suggestion,
      },
    })
  })

  it('applies document suggestion with custom prompt', async () => {
    commit = await mergeCommit(commit).then((r) => r.unwrap())

    const result = await applyDocumentSuggestion({
      suggestion: suggestion,
      commit: commit,
      prompt: 'custom prompt',
      workspace: workspace,
      project: project,
      user: user,
    }).then((r) => r.unwrap())

    expect(result).toEqual({
      suggestion,
      draft: expect.objectContaining({
        title: `Refined 'prompt'`,
        description: 'Created by a suggestion.',
        mergedAt: null,
      }),
    })
    const suggestionsRepository = new DocumentSuggestionsRepository(
      workspace.id,
    )
    await expect(
      suggestionsRepository.find(suggestion.id).then((r) => r.unwrap()),
    ).rejects.toThrowError(NotFoundError)
    const documentsRepository = new DocumentVersionsRepository(workspace.id)
    document = await documentsRepository
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: result.draft!.uuid,
        documentUuid: result.suggestion.documentUuid,
      })
      .then((r) => r.unwrap())
    expect(document.content).toEqual('custom prompt')
    expect(mocks.publisher).toHaveBeenLastCalledWith({
      type: 'documentSuggestionApplied',
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        suggestion: suggestion,
      },
    })
  })
})
