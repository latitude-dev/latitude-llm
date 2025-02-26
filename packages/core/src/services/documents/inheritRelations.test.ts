import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DocumentSuggestion,
  DocumentVersion,
  EvaluationMetadataType,
  EvaluationResultableType,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { ConflictError } from '../../lib'
import { DocumentSuggestionsRepository } from '../../repositories'
import { documentVersions } from '../../schema'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits'
import { inheritDocumentRelations } from './inheritRelations'

describe('inheritDocumentRelations', () => {
  let workspace: Workspace
  let fromAnotherDocument: DocumentVersion
  let fromVersion: DocumentVersion
  let toVersion: DocumentVersion
  let suggestion: DocumentSuggestion

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

    const fromCommit = await factories.createCommit({
      projectId: project.id,
      user: user,
    })

    const { documentVersion } = await factories.createDocumentVersion({
      workspace: workspace,
      user: user,
      commit: fromCommit,
      path: 'prompt',
      content: factories.helpers.createPrompt({ provider }),
    })
    fromVersion = documentVersion

    const { documentVersion: anotherDocument } =
      await factories.createDocumentVersion({
        workspace: workspace,
        user: user,
        commit: fromCommit,
        path: 'another-prompt',
        content: factories.helpers.createPrompt({ provider }),
      })
    fromAnotherDocument = anotherDocument

    const evaluation = await factories.createEvaluation({
      workspace: workspace,
      user: user,
      metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
      resultType: EvaluationResultableType.Number,
      resultConfiguration: { minValue: 0, maxValue: 100 },
    })

    suggestion = await factories.createDocumentSuggestion({
      document: fromVersion,
      evaluation: evaluation,
    })

    await mergeCommit(fromCommit).then((r) => r.unwrap())

    const { commit: toCommit } = await factories.createDraft({
      project: project,
      user: user,
    })

    // Manually create the document version because updateDocument
    // factory would already inherit relations by itself
    const newDocumentVersion = await database
      .insert(documentVersions)
      .values({
        ...fromVersion,
        id: undefined,
        commitId: toCommit.id,
      })
      .returning()

    toVersion = newDocumentVersion[0]!
  })

  it('does not inherit relations between the same version', async () => {
    const repository = new DocumentSuggestionsRepository(workspace.id)
    expect(
      await repository
        .listByDocumentVersionWithDetails({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual([])

    await inheritDocumentRelations({
      fromVersion: toVersion,
      toVersion: toVersion,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(
      await repository
        .listByDocumentVersionWithDetails({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual([])
  })

  it('does not inherit relations between different documents', async () => {
    const repository = new DocumentSuggestionsRepository(workspace.id)
    expect(
      await repository
        .listByDocumentVersionWithDetails({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual([])

    await expect(
      inheritDocumentRelations({
        fromVersion: fromAnotherDocument,
        toVersion: toVersion,
        workspace: workspace,
      }).then((r) => r.unwrap()),
    ).rejects.toThrowError(
      new ConflictError('Cannot inherit relations between different documents'),
    )

    expect(
      await repository
        .listByDocumentVersionWithDetails({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual([])
  })

  it('does inherit relations', async () => {
    const repository = new DocumentSuggestionsRepository(workspace.id)
    expect(
      await repository
        .listByDocumentVersionWithDetails({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual([])

    await inheritDocumentRelations({
      fromVersion: fromVersion,
      toVersion: toVersion,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(
      await repository
        .listByDocumentVersionWithDetails({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual([
      expect.objectContaining({
        prompt: suggestion.prompt,
        summary: suggestion.summary,
      }),
    ])
  })
})
