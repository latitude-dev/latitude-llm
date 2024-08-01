import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '$core/repositories'
import { describe, expect, it } from 'vitest'

import { recomputeChanges } from './recomputeChanges'
import { updateDocument } from './update'

describe('updateDocument', () => {
  it('modifies a document that was created in a previous commit', async (ctx) => {
    const { project, user, documents } = await ctx.factories.createProject({
      documents: {
        doc1: 'Doc 1 commit 1',
      },
    })

    const docsScope = new DocumentVersionsRepository(project.workspaceId)
    const { commit } = await ctx.factories.createDraft({ project, user })

    await updateDocument({
      commit,
      document: documents[0]!,
      content: 'Doc 1 commit 2',
    }).then((r) => r.unwrap())

    await recomputeChanges(commit)

    const changedDocuments = await docsScope
      .listCommitChanges(commit)
      .then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(1)
    expect(changedDocuments[0]!.path).toBe('doc1')
    expect(changedDocuments[0]!.content).toBe('Doc 1 commit 2')
  })

  it('modifies a document that was created in the same commit', async (ctx) => {
    const { project, user } = await ctx.factories.createProject()
    const docsScope = new DocumentVersionsRepository(project.workspaceId)
    const { commit } = await ctx.factories.createDraft({ project, user })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit: commit,
      path: 'doc1',
      content: 'Doc 1 v1',
    })

    await updateDocument({
      commit,
      document: doc,
      content: 'Doc 1 v2',
    }).then((r) => r.unwrap())

    await recomputeChanges(commit)

    const changedDocuments = await docsScope
      .listCommitChanges(commit)
      .then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(1)
    expect(changedDocuments[0]!.path).toBe('doc1')
    expect(changedDocuments[0]!.content).toBe('Doc 1 v2')
  })

  it('modifying a document creates a change to all other documents that reference it', async (ctx) => {
    const { project, user, documents } = await ctx.factories.createProject({
      documents: {
        referenced: {
          doc: 'The document that is being referenced',
        },
        unmodified: '<ref prompt="referenced/doc" />',
      },
    })

    const docsScope = new DocumentVersionsRepository(project.workspaceId)
    const referencedDoc = documents.find((d) => d.path === 'referenced/doc')!
    const { commit: draft } = await ctx.factories.createDraft({ project, user })

    await updateDocument({
      commit: draft,
      document: referencedDoc,
      content: 'The document that is being referenced v2',
    }).then((r) => r.unwrap())

    await recomputeChanges(draft)

    const changedDocuments = await docsScope
      .listCommitChanges(draft)
      .then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(2)
    expect(
      changedDocuments.find((d) => d.path === 'referenced/doc'),
    ).toBeDefined()
    expect(changedDocuments.find((d) => d.path === 'unmodified')).toBeDefined()
  })

  it('renaming a document creates a change to all other documents that reference it', async (ctx) => {
    const { project, user, documents } = await ctx.factories.createProject({
      documents: {
        referenced: {
          doc: 'The document that is being referenced',
        },
        main: '<ref prompt="referenced/doc" />',
      },
    })
    const docsScope = new DocumentVersionsRepository(project.workspaceId)
    const refDoc = documents.find((d) => d.path === 'referenced/doc')!

    const { commit } = await ctx.factories.createDraft({ project, user })

    await updateDocument({
      commit,
      document: refDoc,
      path: 'referenced/doc2',
    }).then((r) => r.unwrap())

    await recomputeChanges(commit)

    const changedDocuments = await docsScope
      .listCommitChanges(commit)
      .then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(2)
    expect(
      changedDocuments.find((d) => d.path === 'referenced/doc2'),
    ).toBeDefined()
    expect(changedDocuments.find((d) => d.path === 'main')).toBeDefined()
  })

  it('undoing a change to a document removes it from the list of changed documents', async (ctx) => {
    const { project, user, documents } = await ctx.factories.createProject({
      documents: {
        referenced: {
          doc: 'The document that is being referenced',
        },
        unmodified: '<ref prompt="referenced/doc" />',
      },
    })
    const docsScope = new DocumentVersionsRepository(project.workspaceId)
    const referencedDoc = documents.find((d) => d.path === 'referenced/doc')!

    const { commit } = await ctx.factories.createDraft({ project, user })

    await updateDocument({
      commit,
      document: referencedDoc,
      content: 'The document that is being referenced v2',
    }).then((r) => r.unwrap())

    await recomputeChanges(commit)

    const changedDocuments = await docsScope
      .listCommitChanges(commit)
      .then((r) => r.unwrap())

    expect(changedDocuments.length).toBe(2)
    expect(
      changedDocuments.find((d) => d.path === 'referenced/doc'),
    ).toBeDefined()
    expect(changedDocuments.find((d) => d.path === 'unmodified')).toBeDefined()

    await updateDocument({
      commit,
      document: referencedDoc,
      content: referencedDoc.content, // Undo the change
    }).then((r) => r.unwrap())

    await recomputeChanges(commit)

    const changedDocuments2 = await docsScope
      .listCommitChanges(commit)
      .then((r) => r.unwrap())

    expect(changedDocuments2.length).toBe(0)
  })

  it('fails when renaming a document with a path that already exists', async (ctx) => {
    const { project, user, documents } = await ctx.factories.createProject({
      documents: {
        doc1: 'Doc 1',
        doc2: 'Doc 2',
      },
    })

    const { commit } = await ctx.factories.createDraft({ project, user })
    const doc1 = documents.find((d) => d.path === 'doc1')!

    const updateResult = await updateDocument({
      commit,
      document: doc1,
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
    const commitsScope = new CommitsRepository(project.workspaceId)

    const commit = await commitsScope
      .getHeadCommit(project)
      .then((r) => r.unwrap())
    const fooDoc = documents.find((d) => d.path === 'foo')!

    const result = await updateDocument({
      commit,
      document: fooDoc,
      content: 'bar',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('Cannot modify a merged commit')
  })

  it('invalidates the resolvedContent for all documents in the commit', async (ctx) => {
    const { project, user, documents } = await ctx.factories.createProject({
      documents: {
        doc1: 'Doc 1',
        doc2: 'Doc 2',
      },
    })
    const docsScope = new DocumentVersionsRepository(project.workspaceId)

    const { commit } = await ctx.factories.createDraft({ project, user })
    const doc1 = documents.find((d) => d.path === 'doc1')!
    const doc2 = documents.find((d) => d.path === 'doc2')!

    await updateDocument({
      commit,
      document: doc1,
      content: 'Doc 1 v2',
    }).then((r) => r.unwrap())

    await recomputeChanges(commit)

    await updateDocument({
      commit,
      document: doc2,
      content: 'Doc 2 v2',
    })

    const commitDocs = await docsScope
      .getDocumentsAtCommit(commit)
      .then((r) => r.unwrap())

    expect(commitDocs.find((d) => d.path === 'doc1')!.resolvedContent).toBe(
      null,
    )
    expect(commitDocs.find((d) => d.path === 'doc2')!.resolvedContent).toBe(
      null,
    )
  })
})
