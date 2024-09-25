import { describe, expect, it } from 'vitest'

import { database } from '../../client'
import { BadRequestError } from '../../lib'
import { DocumentVersionsRepository } from '../../repositories'
import { mergeCommit } from '../commits/merge'
import { createNewDocument } from './create'

describe('createNewDocument', () => {
  it('creates a new document version in the commit', async (ctx) => {
    const { project, user } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

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
    const { project, user } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

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
    const { project, user, providers } = await ctx.factories.createProject()
    let { commit } = await ctx.factories.createDraft({ project, user })
    await createNewDocument({
      commit,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({ provider: providers[0]! }),
    })
    commit = await mergeCommit(commit).then((r) => r.unwrap())

    const result = await createNewDocument({
      commit,
      path: 'foo',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('Cannot modify a merged commit')
  })

  it('creates a new document with default content when no content is provided', async (ctx) => {
    const { project, user } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

    const documentResult = await createNewDocument({
      commit,
      path: 'newdoc',
    })

    const document = documentResult.unwrap()
    expect(document.path).toBe('newdoc')

    const scope = new DocumentVersionsRepository(project.workspaceId)
    const commitChanges = await scope.listCommitChanges(commit)
    expect(commitChanges.value.length).toBe(1)

    const createdDocument = commitChanges.value[0]!
    expect(createdDocument.documentUuid).toBe(document.documentUuid)
    expect(createdDocument.path).toBe(document.path)

    const firstProvider = await database.query.providerApiKeys.findFirst()

    // Check for default content
    expect(createdDocument.content).toBe(
      `
---
provider: ${firstProvider!.name}
model: gpt-4o-mini
---
          `.trim(),
    )
  })

  it('fails when no provider is found', async (ctx) => {
    const { project, user } = await ctx.factories.createProject({
      providers: [],
    })
    const { commit } = await ctx.factories.createDraft({ project, user })

    const result = await createNewDocument({
      commit,
      path: 'newdoc',
    })

    expect(result.error).toEqual(
      new BadRequestError('No provider found when creating document'),
    )
  })
})
