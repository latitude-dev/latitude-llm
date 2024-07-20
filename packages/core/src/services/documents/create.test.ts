import { DocumentVersionsRepository } from '$core/repositories'
import { describe, expect, it } from 'vitest'

import { mergeCommit } from '../commits/merge'
import { createNewDocument } from './create'

describe('createNewDocument', () => {
  it('creates a new document version in the commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })

    const documentResult = await createNewDocument({
      commit,
      path: 'foo',
    })

    const document = documentResult.unwrap()
    expect(document.path).toBe('foo')

    const scope = new DocumentVersionsRepository(project.workspaceId)
    const commitChanges = await scope.listCommitChanges(commit)
    expect(commitChanges.value.length).toBe(1)
    expect(commitChanges.value[0]!.documentUuid).toBe(document.documentUuid)
    expect(commitChanges.value[0]!.path).toBe(document.path)
  })

  it('fails if there is another document with the same path', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })

    await createNewDocument({
      commit,
      path: 'foo',
    })

    const result = await createNewDocument({
      commit,
      path: 'foo',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe(
      'A document with the same path already exists',
    )
  })

  it('fails when trying to create a document in a merged commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    let { commit } = await ctx.factories.createDraft({ project })
    commit = await mergeCommit(commit).then((r) => r.unwrap())

    const result = await createNewDocument({
      commit,
      path: 'foo',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('Cannot modify a merged commit')
  })

  it('fails when trying to create a document in a merged commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    let { commit } = await ctx.factories.createDraft({ project })
    commit = await mergeCommit(commit).then((r) => r.unwrap())

    const result = await createNewDocument({
      commit,
      path: 'foo',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('Cannot modify a merged commit')
  })
})
