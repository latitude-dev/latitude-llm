import { HEAD_COMMIT } from '$core/constants'
import { updateDocument } from '$core/services'
import { mergeCommit } from '$core/services/commits/merge'
import { describe, expect, it } from 'vitest'

import { CommitsRepository } from './commitsRepository'
import { DocumentVersionsRepository } from './documentVersionsRepository'

describe('getDocumentsAtCommit', () => {
  it('returns the document of the only commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const workspaceId = project.workspaceId
    let { commit } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit,
    })

    commit = await mergeCommit(commit).then((r) => r.unwrap())

    const scope = new DocumentVersionsRepository(workspaceId)
    const result = await scope.getDocumentsAtCommit(commit)
    const documents = result.unwrap()

    expect(documents.length).toBe(1)
    expect(documents[0]!.documentUuid).toBe(doc.documentUuid)
  })

  it('returns the right document version for each commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const workspaceId = project.workspaceId
    const scope = new DocumentVersionsRepository(workspaceId)

    let { commit: commit1 } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit: commit1,
      content: 'VERSION 1',
    })
    commit1 = await mergeCommit(commit1).then((r) => r.unwrap())

    const { commit: commit2 } = await ctx.factories.createDraft({ project })
    await updateDocument({
      commit: commit2,
      document: doc,
      content: 'VERSION 2',
    }).then((r) => r.unwrap())

    const { commit: commit3 } = await ctx.factories.createDraft({ project })
    await updateDocument({
      commit: commit3,
      document: doc,
      content: 'VERSION 3 (draft)',
    }).then((r) => r.unwrap())

    await mergeCommit(commit2).then((r) => r.unwrap())

    const commit1Docs = await scope
      .getDocumentsAtCommit(commit1)
      .then((r) => r.unwrap())
    expect(commit1Docs.length).toBe(1)
    expect(commit1Docs[0]!.content).toBe('VERSION 1')

    const commit2Docs = await scope
      .getDocumentsAtCommit(commit2)
      .then((r) => r.unwrap())
    expect(commit2Docs.length).toBe(1)
    expect(commit2Docs[0]!.content).toBe('VERSION 2')

    const commit3Docs = await scope
      .getDocumentsAtCommit(commit3)
      .then((r) => r.unwrap())
    expect(commit3Docs.length).toBe(1)
    expect(commit3Docs[0]!.content).toBe('VERSION 3 (draft)')

    const commitsScope = new CommitsRepository(workspaceId)
    const headCommit = await commitsScope
      .getCommitByUuid({
        project,
        uuid: HEAD_COMMIT,
      })
      .then((r) => r.unwrap())
    const headDocs = await scope
      .getDocumentsAtCommit(headCommit)
      .then((r) => r.unwrap())
    expect(headDocs.length).toBe(1)
    expect(headDocs[0]!.content).toBe('VERSION 2')
  })

  it('returns documents that were last modified in a previous commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const workspaceId = project.workspaceId
    const scope = new DocumentVersionsRepository(workspaceId)

    let { commit: commit1 } = await ctx.factories.createDraft({ project })
    await ctx.factories.createDocumentVersion({
      commit: commit1,
      content: 'Doc 1 commit 1',
    })

    commit1 = await mergeCommit(commit1).then((r) => r.unwrap())

    let { commit: commit2 } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc2 } = await ctx.factories.createDocumentVersion(
      { commit: commit2, content: 'Doc 2 commit 2' },
    )

    commit2 = await mergeCommit(commit2).then((r) => r.unwrap())

    const { commit: commit3 } = await ctx.factories.createDraft({ project })
    await updateDocument({
      commit: commit3,
      document: doc2,
      content: 'Doc 2 commit 3 (draft)',
    }).then((r) => r.unwrap())

    const commit1Docs = await scope
      .getDocumentsAtCommit(commit1)
      .then((r) => r.unwrap())
    expect(commit1Docs.length).toBe(1)
    const commit1DocContents = commit1Docs.map((d) => d.content)
    expect(commit1DocContents).toContain('Doc 1 commit 1')

    const commit2Docs = await scope
      .getDocumentsAtCommit(commit2)
      .then((r) => r.unwrap())
    expect(commit2Docs.length).toBe(2)
    const commit2DocContents = commit2Docs.map((d) => d.content)
    expect(commit2DocContents).toContain('Doc 1 commit 1')
    expect(commit2DocContents).toContain('Doc 2 commit 2')

    const commit3Docs = await scope
      .getDocumentsAtCommit(commit3)
      .then((r) => r.unwrap())
    expect(commit3Docs.length).toBe(2)
    const commit3DocContents = commit3Docs.map((d) => d.content)
    expect(commit3DocContents).toContain('Doc 1 commit 1')
    expect(commit3DocContents).toContain('Doc 2 commit 3 (draft)')

    const commitsScope = new CommitsRepository(workspaceId)
    const headCommit = await commitsScope
      .getCommitByUuid({
        project,
        uuid: HEAD_COMMIT,
      })
      .then((r) => r.unwrap())
    const headDocs = await scope
      .getDocumentsAtCommit(headCommit)
      .then((r) => r.unwrap())
    expect(headDocs.length).toBe(2)
    const headDocContents = headDocs.map((d) => d.content)
    expect(headDocContents).toContain('Doc 1 commit 1')
    expect(headDocContents).toContain('Doc 2 commit 2')
  })
})
