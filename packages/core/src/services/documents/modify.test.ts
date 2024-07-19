import { listCommitChanges } from '$core/data-access'
import useTestDatabase from '$core/tests/useTestDatabase'
import { describe, expect, it } from 'vitest'

import mergeCommit from '../commits/merge'
import { modifyExistingDocument } from './modify'

useTestDatabase()

describe('modifyExistingDocument', () => {
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

    await modifyExistingDocument({
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

    await modifyExistingDocument({
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
})
