import { getDocumentsAtCommit, listCommitChanges } from '$core/data-access'
import { describe, expect, it } from 'vitest'

import { mergeCommit } from '../commits/merge'
import { updateDocument } from './update'

describe('updateDocument', () => {
  it('modifies a document that was created in a previous commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit: commit1 } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit: commit1,
      path: 'doc1',
      content: 'Doc 1 commit 1',
    })
    await mergeCommit({ commitId: commit1.id })

    const { commit: commit2 } = await ctx.factories.createDraft({ project })

    await updateDocument({
      commitId: commit2.id,
      documentUuid: doc.documentUuid,
      content: 'Doc 1 commit 2',
    }).then((r) => r.unwrap())

    const changedDocuments = await listCommitChanges({
      commitId: commit2.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(1)
    expect(changedDocuments[0]!.path).toBe('doc1')
    expect(changedDocuments[0]!.content).toBe('Doc 1 commit 2')
  })

  it('modifies a document that was created in the same commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit: commit,
      path: 'doc1',
      content: 'Doc 1 v1',
    })

    await updateDocument({
      commitId: commit.id,
      documentUuid: doc.documentUuid,
      content: 'Doc 1 v2',
    }).then((r) => r.unwrap())

    const changedDocuments = await listCommitChanges({
      commitId: commit.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(1)
    expect(changedDocuments[0]!.path).toBe('doc1')
    expect(changedDocuments[0]!.content).toBe('Doc 1 v2')
  })

  it('modifying a document creates a change to all other documents that reference it', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit: commit1 } = await ctx.factories.createDraft({ project })
    const { documentVersion: referencedDoc } =
      await ctx.factories.createDocumentVersion({
        commit: commit1,
        path: 'referenced/doc',
        content: 'The document that is being referenced',
      })
    await ctx.factories.createDocumentVersion({
      commit: commit1,
      path: 'unmodified',
      content: '<ref prompt="referenced/doc" />',
    })
    await mergeCommit({ commitId: commit1.id })

    const { commit: commit2 } = await ctx.factories.createDraft({ project })

    await updateDocument({
      commitId: commit2.id,
      documentUuid: referencedDoc.documentUuid,
      content: 'The document that is being referenced v2',
    }).then((r) => r.unwrap())

    const changedDocuments = await listCommitChanges({
      commitId: commit2.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(2)
    expect(
      changedDocuments.find((d) => d.path === 'referenced/doc'),
    ).toBeDefined()
    expect(changedDocuments.find((d) => d.path === 'unmodified')).toBeDefined()
  })

  it('renaming a document creates a change to all other documents that reference it', async (ctx) => {
    const { project } = await ctx.factories.createProject({
      documents: {
        referenced: {
          doc: 'The document that is being referenced',
        },
        main: '<ref prompt="referenced/doc" />',
      },
    })

    const { commit } = await ctx.factories.createDraft({ project })
    const documents = await getDocumentsAtCommit({ commitId: commit.id }).then(
      (r) => r.unwrap(),
    )
    const refDoc = documents.find((d) => d.path === 'referenced/doc')!

    await updateDocument({
      commitId: commit.id,
      documentUuid: refDoc.documentUuid,
      path: 'referenced/doc2',
    }).then((r) => r.unwrap())

    const changedDocuments = await listCommitChanges({
      commitId: commit.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(2)
    expect(
      changedDocuments.find((d) => d.path === 'referenced/doc2'),
    ).toBeDefined()
    expect(changedDocuments.find((d) => d.path === 'main')).toBeDefined()
  })

  it('undoing a change to a document removes it from the list of changed documents', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit: commit1 } = await ctx.factories.createDraft({ project })
    const { documentVersion: referencedDoc } =
      await ctx.factories.createDocumentVersion({
        commit: commit1,
        path: 'referenced/doc',
        content: 'The document that is being referenced',
      })
    await ctx.factories.createDocumentVersion({
      commit: commit1,
      path: 'unmodified',
      content: '<ref prompt="referenced/doc" />',
    })
    await mergeCommit({ commitId: commit1.id })

    const { commit: commit2 } = await ctx.factories.createDraft({ project })

    await updateDocument({
      commitId: commit2.id,
      documentUuid: referencedDoc.documentUuid,
      content: 'The document that is being referenced v2',
    }).then((r) => r.unwrap())

    const changedDocuments = await listCommitChanges({
      commitId: commit2.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(2)
    expect(
      changedDocuments.find((d) => d.path === 'referenced/doc'),
    ).toBeDefined()
    expect(changedDocuments.find((d) => d.path === 'unmodified')).toBeDefined()

    await updateDocument({
      commitId: commit2.id,
      documentUuid: referencedDoc.documentUuid,
      content: referencedDoc.content, // Undo the change
    }).then((r) => r.unwrap())

    const changedDocuments2 = await listCommitChanges({
      commitId: commit2.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments2.length).toBe(0)
  })
})
