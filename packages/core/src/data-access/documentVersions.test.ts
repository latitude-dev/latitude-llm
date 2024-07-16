import { HEAD_COMMIT } from '$core/constants'
import mergeCommit from '$core/services/commits/merge'
import useTestDatabase from '$core/tests/useTestDatabase'
import { describe, expect, it } from 'vitest'

import { getDocumentsAtCommit } from './documentVersions'

useTestDatabase()

describe('getDocumentsAtCommit', () => {
  it('returns the document of the only commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createCommit({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit,
    })

    const result = await getDocumentsAtCommit({
      commitUuid: commit.uuid,
      projectId: project.id,
    })
    const documents = result.unwrap()

    expect(documents.length).toBe(1)
    expect(documents[0]!.id).toBe(doc.id)
  })

  it('returns the right document version for each commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()

    const { commit: commit1 } = await ctx.factories.createDraft({ project })
    const { documentVersion: doc } = await ctx.factories.createDocumentVersion({
      commit: commit1,
      content: 'VERSION 1',
    })

    const { commit: commit2 } = await ctx.factories.createDraft({ project })
    await ctx.factories.createDocumentVersion({
      commit: commit2,
      documentUuid: doc.documentUuid,
      content: 'VERSION 2',
    })

    const { commit: commit3 } = await ctx.factories.createDraft({ project })
    await ctx.factories.createDocumentVersion({
      commit: commit3,
      documentUuid: doc.documentUuid,
      content: 'VERSION 3',
    })

    // Commit 1 is merged AFTER commit 2
    // Commit 3 is not merged
    await mergeCommit({ commitId: commit2.id })
    await mergeCommit({ commitId: commit1.id })

    const commit1Result = await getDocumentsAtCommit({
      commitUuid: commit1.uuid,
      projectId: project.id,
    })
    const commit1Docs = commit1Result.unwrap()
    expect(commit1Docs.length).toBe(1)
    expect(commit1Docs[0]!.content).toBe('VERSION 1')

    const commit2Result = await getDocumentsAtCommit({
      commitUuid: commit2.uuid,
      projectId: project.id,
    })
    const commit2Docs = commit2Result.unwrap()
    expect(commit2Docs.length).toBe(1)
    expect(commit2Docs[0]!.content).toBe('VERSION 2')

    const commit3Result = await getDocumentsAtCommit({
      commitUuid: commit3.uuid,
      projectId: project.id,
    })
    const commit3Docs = commit3Result.unwrap()
    expect(commit3Docs.length).toBe(1)
    expect(commit3Docs[0]!.content).toBe('VERSION 3')

    const headResult = await getDocumentsAtCommit({
      commitUuid: HEAD_COMMIT,
      projectId: project.id,
    })
    const headDocs = headResult.unwrap()
    expect(headDocs.length).toBe(1)
    expect(headDocs[0]!.content).toBe('VERSION 1')
  })

  it('returns documents that were last modified in a previous commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()

    const { commit: commit1 } = await ctx.factories.createCommit({ project })
    await ctx.factories.createDocumentVersion({
      commit: commit1,
      content: 'Doc 1 commit 1',
    })

    const { commit: commit2 } = await ctx.factories.createCommit({ project })
    const { documentVersion: doc2 } = await ctx.factories.createDocumentVersion(
      { commit: commit2, content: 'Doc 2 commit 2' },
    )

    const { commit: commit3 } = await ctx.factories.createDraft({ project })
    await ctx.factories.createDocumentVersion({
      commit: commit3,
      documentUuid: doc2.documentUuid,
      content: 'Doc 2 commit 3 (draft)',
    })

    const commit1Result = await getDocumentsAtCommit({
      commitUuid: commit1.uuid,
      projectId: project.id,
    })
    const commit1Docs = commit1Result.unwrap()
    expect(commit1Docs.length).toBe(1)
    const commit1DocContents = commit1Docs.map((d) => d.content)
    expect(commit1DocContents).toContain('Doc 1 commit 1')

    const commit2Result = await getDocumentsAtCommit({
      commitUuid: commit2.uuid,
      projectId: project.id,
    })
    const commit2Docs = commit2Result.unwrap()
    expect(commit2Docs.length).toBe(2)
    const commit2DocContents = commit2Docs.map((d) => d.content)
    expect(commit2DocContents).toContain('Doc 1 commit 1')
    expect(commit2DocContents).toContain('Doc 2 commit 2')

    const commit3Result = await getDocumentsAtCommit({
      commitUuid: commit3.uuid,
      projectId: project.id,
    })
    const commit3Docs = commit3Result.unwrap()
    expect(commit3Docs.length).toBe(2)
    const commit3DocContents = commit3Docs.map((d) => d.content)
    expect(commit3DocContents).toContain('Doc 1 commit 1')
    expect(commit3DocContents).toContain('Doc 2 commit 3 (draft)')

    const headResult = await getDocumentsAtCommit({
      commitUuid: HEAD_COMMIT,
      projectId: project.id,
    })
    const headDocs = headResult.unwrap()
    expect(headDocs.length).toBe(2)
    const headDocContents = headDocs.map((d) => d.content)
    expect(headDocContents).toContain('Doc 1 commit 1')
    expect(headDocContents).toContain('Doc 2 commit 2')
  })
})
