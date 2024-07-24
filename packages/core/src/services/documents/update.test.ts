import { findHeadCommit, listCommitChanges } from '$core/data-access'
import { describe, expect, it } from 'vitest'

import { recomputeChanges } from './recomputeChanges'
import { updateDocument } from './update'

describe('updateDocument', () => {
  it('modifies a document that was created in a previous commit', async (ctx) => {
    const { project, documents } = await ctx.factories.createProject({
      documents: {
        doc1: 'Doc 1 commit 1',
      },
    })

    const { commit } = await ctx.factories.createDraft({ project })

    await updateDocument({
      commitId: commit.id,
      documentUuid: documents[0]!.documentUuid,
      content: 'Doc 1 commit 2',
    }).then((r) => r.unwrap())

    await recomputeChanges({ commitId: commit.id })

    const changedDocuments = await listCommitChanges({
      commitId: commit.id,
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

    await recomputeChanges({ commitId: commit.id })

    const changedDocuments = await listCommitChanges({
      commitId: commit.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(1)
    expect(changedDocuments[0]!.path).toBe('doc1')
    expect(changedDocuments[0]!.content).toBe('Doc 1 v2')
  })

  it('modifying a document creates a change to all other documents that reference it', async (ctx) => {
    const { project, documents } = await ctx.factories.createProject({
      documents: {
        referenced: {
          doc: 'The document that is being referenced',
        },
        unmodified: '<ref prompt="referenced/doc" />',
      },
    })

    const referencedDoc = documents.find((d) => d.path === 'referenced/doc')!
    const { commit } = await ctx.factories.createDraft({ project })

    await updateDocument({
      commitId: commit.id,
      documentUuid: referencedDoc.documentUuid,
      content: 'The document that is being referenced v2',
    }).then((r) => r.unwrap())

    await recomputeChanges({ commitId: commit.id })

    const changedDocuments = await listCommitChanges({
      commitId: commit.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(2)
    expect(
      changedDocuments.find((d) => d.path === 'referenced/doc'),
    ).toBeDefined()
    expect(changedDocuments.find((d) => d.path === 'unmodified')).toBeDefined()
  })

  it('renaming a document creates a change to all other documents that reference it', async (ctx) => {
    const { project, documents } = await ctx.factories.createProject({
      documents: {
        referenced: {
          doc: 'The document that is being referenced',
        },
        main: '<ref prompt="referenced/doc" />',
      },
    })
    const refDoc = documents.find((d) => d.path === 'referenced/doc')!

    const { commit } = await ctx.factories.createDraft({ project })

    await updateDocument({
      commitId: commit.id,
      documentUuid: refDoc.documentUuid,
      path: 'referenced/doc2',
    }).then((r) => r.unwrap())

    await recomputeChanges({ commitId: commit.id })

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
    const { project, documents } = await ctx.factories.createProject({
      documents: {
        referenced: {
          doc: 'The document that is being referenced',
        },
        unmodified: '<ref prompt="referenced/doc" />',
      },
    })
    const referencedDoc = documents.find((d) => d.path === 'referenced/doc')!

    const { commit } = await ctx.factories.createDraft({ project })

    await updateDocument({
      commitId: commit.id,
      documentUuid: referencedDoc.documentUuid,
      content: 'The document that is being referenced v2',
    }).then((r) => r.unwrap())

    await recomputeChanges({ commitId: commit.id })

    const changedDocuments = await listCommitChanges({
      commitId: commit.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(2)
    expect(
      changedDocuments.find((d) => d.path === 'referenced/doc'),
    ).toBeDefined()
    expect(changedDocuments.find((d) => d.path === 'unmodified')).toBeDefined()

    await updateDocument({
      commitId: commit.id,
      documentUuid: referencedDoc.documentUuid,
      content: referencedDoc.content, // Undo the change
    }).then((r) => r.unwrap())

    await recomputeChanges({ commitId: commit.id })

    const changedDocuments2 = await listCommitChanges({
      commitId: commit.id,
    }).then((r) => r.unwrap())

    expect(changedDocuments2.length).toBe(0)
  })

  it('fails when renaming a document with a path that already exists', async (ctx) => {
    const { project, documents } = await ctx.factories.createProject({
      documents: {
        doc1: 'Doc 1',
        doc2: 'Doc 2',
      },
    })

    const { commit } = await ctx.factories.createDraft({ project })
    const doc1 = documents.find((d) => d.path === 'doc1')!

    const updateResult = await updateDocument({
      commitId: commit.id,
      documentUuid: doc1.documentUuid,
      path: 'doc2',
    })

    expect(updateResult.ok).toBe(false)
    expect(updateResult.error!.message).toBe(
      'A document with the same path already exists',
    )
  })

  it('fails when trying to create a document in a merged commit', async (ctx) => {
    const { project, documents } = await ctx.factories.createProject({
      documents: {
        foo: 'foo',
      },
    })

    const commit = await findHeadCommit({ projectId: project.id }).then((r) =>
      r.unwrap(),
    )
    const fooDoc = documents.find((d) => d.path === 'foo')!

    const result = await updateDocument({
      commitId: commit.id,
      documentUuid: fooDoc.documentUuid,
      content: 'bar',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('Cannot modify a merged commit')
  })
})
