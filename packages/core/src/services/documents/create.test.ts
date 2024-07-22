import { listCommitChanges } from '$core/data-access'
import { describe, expect, it } from 'vitest'

import { mergeCommit } from '../commits/merge'
import { createNewDocument } from './create'

describe('createNewDocument', () => {
  it('creates a new document version in the commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })

    const documentResult = await createNewDocument({
      commitId: commit.id,
      path: 'foo',
    })

    const document = documentResult.unwrap()
    expect(document.path).toBe('foo')

    const commitChanges = await listCommitChanges({ commitId: commit.id })
    expect(commitChanges.value.length).toBe(1)
    expect(commitChanges.value[0]!.documentUuid).toBe(document.documentUuid)
    expect(commitChanges.value[0]!.path).toBe(document.path)
  })

  it('fails if there is another document with the same path', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })

    await createNewDocument({
      commitId: commit.id,
      path: 'foo',
    })

    const result = await createNewDocument({
      commitId: commit.id,
      path: 'foo',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe(
      'A document with the same path already exists',
    )
  })

  it('fails when trying to create a document in a merged commit', async (ctx) => {
    const { project } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project })
    await mergeCommit({ commitId: commit.id })

    const result = await createNewDocument({
      commitId: commit.id,
      path: 'foo',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe(
      'Cannot create a document version in a merged commit',
    )
  })

  it('modifies other documents if it is referenced by another document', async (ctx) => {
    const { project } = await ctx.factories.createProject({
      documents: {
        main: '<ref prompt="referenced/doc" />',
      },
    })

    const { commit } = await ctx.factories.createDraft({ project })
    await createNewDocument({
      commitId: commit.id,
      path: 'referenced/doc',
    })

    const changes = await listCommitChanges({ commitId: commit.id }).then((r) =>
      r.unwrap(),
    )
    expect(changes.length).toBe(2)
    const changedDocsPahts = changes.map((c) => c.path)
    expect(changedDocsPahts).toContain('main')
    expect(changedDocsPahts).toContain('referenced/doc')
  })
})
