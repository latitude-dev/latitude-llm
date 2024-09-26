import { describe, expect, it } from 'vitest'

import { Providers } from '../../constants'
import { createCommit } from '../../services/commits'
import { updateDocument } from '../../services/documents'
import { createProject, helpers } from '../../tests/factories'
import { DocumentVersionsRepository } from './index'

describe('DocumentVersionsRepository.getDocumentsForImport', () => {
  it('should return documents for import when given a valid project ID', async () => {
    const { workspace, project, documents } = await createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        'document1.md': helpers.createPrompt({
          provider: 'openai',
          content: 'Content 1',
        }),
        'document2.md': helpers.createPrompt({
          provider: 'openai',
          content: 'Content 2',
        }),
      },
    })

    const workspaceId = workspace.id
    const repository = new DocumentVersionsRepository(workspaceId)
    const result = await repository.getDocumentsForImport(project.id)

    expect(result.ok).toBe(true)
    const importedDocuments = result.unwrap()
    expect(importedDocuments).toHaveLength(documents.length)
    expect(importedDocuments).toEqual(
      expect.arrayContaining(
        documents.map((doc) =>
          expect.objectContaining({
            path: doc.path,
          }),
        ),
      ),
    )
  })

  it('should not return documents that have been deleted at some point', async () => {
    const { workspace, project, user, documents } = await createProject({
      providers: [{ name: 'openai', type: Providers.OpenAI }],
      documents: {
        foo: helpers.createPrompt({
          provider: 'openai',
          content: 'Content 1',
        }),
      },
    })

    const document = documents[0]
    const laterCommit = await createCommit({
      project,
      user,
      data: {
        title: 'Delete document',
      },
    }).then((r) => r.unwrap())

    await updateDocument({
      commit: laterCommit,
      // @ts-expect-error
      document: document,
      deletedAt: new Date(),
    })

    const repository = new DocumentVersionsRepository(workspace.id)
    const result = await repository.getDocumentsForImport(project.id)

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toEqual([])
  })

  it('should return an empty array when no documents are found', async () => {
    const { workspace, project } = await createProject()
    const repository = new DocumentVersionsRepository(workspace.id)
    const result = await repository.getDocumentsForImport(project.id)

    expect(result.ok).toBe(true)
    expect(result.unwrap()).toEqual([])
  })
})
