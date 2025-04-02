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
import { NotFoundError } from '../../lib'
import { DocumentSuggestionsRepository } from '../../repositories'
import * as factories from '../../tests/factories'
import { discardDocumentSuggestion } from './discard'

describe('discardDocumentSuggestion', () => {
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
    })

    mocks = {
      publisher: vi
        .spyOn(publisher, 'publishLater')
        .mockImplementation(async () => {}),
    }
  })

  it('discards document suggestion', async () => {
    const result = await discardDocumentSuggestion({
      suggestion: suggestion,
      workspace: workspace,
      user: user,
    }).then((r) => r.unwrap())

    expect(result).toEqual({ suggestion })
    const repository = new DocumentSuggestionsRepository(workspace.id)
    await expect(
      repository.find(suggestion.id).then((r) => r.unwrap()),
    ).rejects.toThrowError(NotFoundError)
    expect(mocks.publisher).toHaveBeenLastCalledWith({
      type: 'documentSuggestionDiscarded',
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        suggestion: suggestion,
      },
    })
  })
})
