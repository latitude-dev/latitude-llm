import { database } from '$core/client'
import { NotFoundError } from '$core/lib'
import { documentVersions } from '$core/schema'
import { mergeCommit } from '$core/services/commits'
import { updateDocument } from '$core/services/documents/update'
import * as factories from '$core/tests/factories'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createNewDocument } from './create'
import { destroyFolder } from './destroyFolder'

describe('removing folders', () => {
  it('throws error if folder does not exist', async () => {
    const { project, user } = await factories.createProject()
    const { commit: draft } = await factories.createDraft({ project, user })

    const result = await destroyFolder({
      path: 'some-folder',
      commit: draft,
      workspaceId: project.workspaceId,
    })
    expect(result.error).toEqual(new NotFoundError('Folder does not exist'))
  })

  it('throws error if commit is merged', async () => {
    const { project, user } = await factories.createProject()
    const { commit: draft } = await factories.createDraft({ project, user })
    await createNewDocument({
      commit: draft,
      path: 'foo',
      content: 'foo',
    })
    const mergedCommit = await mergeCommit(draft).then((r) => r.unwrap())

    const result = await destroyFolder({
      path: 'some-folder',
      commit: mergedCommit,
      workspaceId: project.workspaceId,
    })

    expect(result.error).toEqual(new Error('Cannot modify a merged commit'))
  })

  it('destroy folder that were in draft document but not in previous merged commits', async () => {
    const { project, user } = await factories.createProject()
    const { commit: draft } = await factories.createDraft({ project, user })
    await factories.createDocumentVersion({
      commit: draft,
      path: 'root-folder/some-folder/doc1',
    })
    await factories.createDocumentVersion({
      commit: draft,
      path: 'root-folder/some-folder/doc2',
    })
    await factories.createDocumentVersion({
      commit: draft,
      path: 'root-folder/some-folder/inner-folder/doc42',
    })
    await factories.createDocumentVersion({
      commit: draft,
      path: 'root-folder/other-nested-folder/doc3',
    })
    await factories.createDocumentVersion({
      commit: draft,
      path: 'root-folder/some-foldernoisadoc',
    })
    await factories.createDocumentVersion({
      commit: draft,
      path: 'other-foler/doc4',
    })

    await destroyFolder({
      path: 'root-folder/some-folder',
      commit: draft,
      workspaceId: project.workspaceId,
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: eq(documentVersions.commitId, draft.id),
    })

    expect(documents.length).toBe(3)
    const paths = documents.map((d) => d.path).sort()
    expect(paths).toEqual([
      'other-foler/doc4',
      'root-folder/other-nested-folder/doc3',
      'root-folder/some-foldernoisadoc',
    ])
  })

  it('create soft deleted documents that were present in merged commits and were deleted in this draft commit', async () => {
    const { project, user } = await factories.createProject({
      documents: {
        'some-folder': {
          doc2: 'Doc 2',
          doc1: 'Doc 1',
        },
      },
    })
    const { commit: draft } = await factories.createDraft({ project, user })

    await destroyFolder({
      path: 'some-folder',
      commit: draft,
      workspaceId: project.workspaceId,
    }).then((r) => r.unwrap())

    const documents = await database.query.documentVersions.findMany({
      where: and(eq(documentVersions.commitId, draft.id)),
    })

    const drafDocuments = documents.filter((d) => d.commitId === draft.id)
    expect(drafDocuments.length).toBe(2)
    const paths = drafDocuments.map((d) => d.path).sort()
    const deletedAt = drafDocuments.map((d) => d.deletedAt).filter(Boolean)
    expect(deletedAt.length).toBe(2)
    expect(paths).toEqual(['some-folder/doc1', 'some-folder/doc2'])
  })

  it('existing documents in this commit draft are marked as deleted', async () => {
    const { project, user, documents } = await factories.createProject({
      documents: {
        'some-folder': {
          doc2: 'Doc 2',
          doc1: 'Doc 1',
        },
      },
    })
    const { commit: draft } = await factories.createDraft({ project, user })
    await Promise.all(
      documents.map((d) =>
        updateDocument({
          commit: draft,
          document: d,
          content: `${d.content} (version 2)`,
        }).then((r) => r.unwrap()),
      ),
    )

    // Fake cached content exists to prove the method invalidate cache
    await database
      .update(documentVersions)
      .set({
        resolvedContent: '[CHACHED] Doc 1 (version 1)',
      })
      .where(eq(documentVersions.commitId, draft.id))

    await destroyFolder({
      path: 'some-folder',
      commit: draft,
      workspaceId: project.workspaceId,
    }).then((r) => r.unwrap())

    const draftDocuments = await database.query.documentVersions.findMany({
      where: and(eq(documentVersions.commitId, draft.id)),
    })

    expect(draftDocuments.length).toBe(2)
    const deletedData = draftDocuments.map((d) => ({
      deletedAt: d.deletedAt,
      resolvedContent: d.resolvedContent,
    }))
    expect(deletedData).toEqual([
      {
        deletedAt: expect.any(Date),
        resolvedContent: null,
      },
      {
        deletedAt: expect.any(Date),
        resolvedContent: null,
      },
    ])
  })
})
