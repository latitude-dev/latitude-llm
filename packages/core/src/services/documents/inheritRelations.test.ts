import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentSuggestion, DocumentVersion, Workspace } from '../../browser'
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
  let suggestions: DocumentSuggestion[]

  let suggestionsRepository: DocumentSuggestionsRepository

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

    suggestions = [
      await factories.createDocumentSuggestion({
        commit: fromCommit,
        document: fromVersion,
        evaluation: {
          ...(await factories.createEvaluation({ workspace, user })),
          version: 'v1',
        },
        workspace: workspace,
      }),
      await factories.createDocumentSuggestion({
        commit: fromCommit,
        document: fromVersion,
        evaluation: {
          ...(await factories.createEvaluation({ workspace, user })),
          version: 'v1',
        },
        workspace: workspace,
      }),
    ]

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

    suggestionsRepository = new DocumentSuggestionsRepository(workspace.id)
  })

  it('does not inherit relations between the same version', async () => {
    await inheritDocumentRelations({
      fromVersion: toVersion,
      toVersion: toVersion,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(
      await suggestionsRepository
        .listByDocumentVersion({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual([])
  })

  it('does not inherit relations between different documents', async () => {
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
      await suggestionsRepository
        .listByDocumentVersion({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual([])
  })

  it('does inherit relations to a new version', async () => {
    await inheritDocumentRelations({
      fromVersion: fromVersion,
      toVersion: toVersion,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(
      await suggestionsRepository
        .listByDocumentVersion({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual(
      expect.arrayContaining(
        suggestions.map((suggestion) => ({
          ...suggestion,
          id: expect.any(Number),
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })),
      ),
    )
  })

  it('does inherit relations to a deleted version', async () => {
    toVersion.deletedAt = new Date()

    await inheritDocumentRelations({
      fromVersion: fromVersion,
      toVersion: toVersion,
      workspace: workspace,
    }).then((r) => r.unwrap())

    expect(
      await suggestionsRepository
        .listByDocumentVersion({
          commitId: toVersion.commitId,
          documentUuid: toVersion.documentUuid,
        })
        .then((r) => r.unwrap()),
    ).toEqual([])
  })
})
