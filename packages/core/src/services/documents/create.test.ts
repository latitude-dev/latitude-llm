import { describe, expect, it } from 'vitest'

import { Providers } from '../../browser'
import {
  DocumentVersionsRepository,
  WorkspacesRepository,
} from '../../repositories'
import { mergeCommit } from '../commits/merge'
import { createNewDocument } from './create'

describe('createNewDocument', () => {
  it('creates a new document version in the commit', async (ctx) => {
    const { project, user, workspace } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

    const documentResult = await createNewDocument({
      workspace,
      user,
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
    const { project, user, workspace } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

    await createNewDocument({
      workspace,
      user,
      commit,
      path: 'foo',
    })

    const result = await createNewDocument({
      workspace,
      user,
      commit,
      path: 'foo',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe(
      'A document with the same path already exists',
    )
  })

  it('fails when trying to create a document in a merged commit', async (ctx) => {
    const { project, user, workspace, providers } =
      await ctx.factories.createProject()
    let { commit } = await ctx.factories.createDraft({ project, user })
    await createNewDocument({
      workspace,
      user,
      commit,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({ provider: providers[0]! }),
    })
    commit = await mergeCommit(commit).then((r) => r.unwrap())

    const result = await createNewDocument({
      workspace,
      user,
      commit,
      path: 'foo',
    })

    expect(result.ok).toBe(false)
    expect(result.error!.message).toBe('Cannot modify a merged commit')
  })

  it('creates a new document with default content when default provider', async (ctx) => {
    let { project, user, workspace } = await ctx.factories.createProject({
      providers: [],
    })
    const { commit } = await ctx.factories.createDraft({ project, user })
    const provider = await ctx.factories.createProviderApiKey({
      workspace,
      type: Providers.Anthropic,
      name: 'Default Provider',
      defaultModel: 'claude-3-5-sonnet-latest',
      user,
    })
    await ctx.factories.setProviderAsDefault(workspace, provider)
    const workspacesScope = new WorkspacesRepository(user.id)
    workspace = await workspacesScope.find(workspace.id).then((r) => r.unwrap())

    const documentResult = await createNewDocument({
      workspace,
      user,
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
    expect(createdDocument.content).toBe(
      `
---
provider: ${provider.name}
model: ${provider.defaultModel}
---
`.trim(),
    )
  })

  it('creates a new document with default content when no default provider', async (ctx) => {
    const { project, user, workspace } = await ctx.factories.createProject({
      providers: [],
    })
    const { commit } = await ctx.factories.createDraft({ project, user })
    const provider = await ctx.factories.createProviderApiKey({
      workspace,
      type: Providers.Custom,
      name: 'First Provider',
      url: 'https://example.com',
      user,
    })
    await ctx.factories.createProviderApiKey({
      workspace,
      type: Providers.OpenAI,
      name: 'Second Provider',
      defaultModel: 'gpt-4o-mini',
      user,
    })

    const documentResult = await createNewDocument({
      workspace,
      user,
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
    expect(createdDocument.content).toBe(
      `
---
provider: ${provider.name}
---
`.trim(),
    )
  })

  it('creates the document without the frontmatter if no provider is found', async (ctx) => {
    const { project, user, workspace } = await ctx.factories.createProject({
      providers: [],
    })
    const { commit } = await ctx.factories.createDraft({ project, user })

    const result = await createNewDocument({
      workspace,
      user,
      commit,
      path: 'newdoc',
    })

    expect(result.ok).toBe(true)
    expect(result.unwrap().content).toBe('')
  })
})
