import { beforeEach, describe, expect, it } from 'vitest'

import {
  Commit,
  Project,
  ProviderApiKey,
  Providers,
  User,
  Workspace,
} from '../../browser'
import {
  DocumentVersionsRepository,
  WorkspacesRepository,
} from '../../repositories'
import * as factories from '../../tests/factories'
import { mergeCommit } from '../commits/merge'
import { createNewDocument } from './create'

let user: User
let workspace: Workspace
let project: Project
let commit: Commit

describe('createNewDocument', () => {
  beforeEach(async () => {
    const {
      project: prj,
      user: usr,
      workspace: wsp,
    } = await factories.createProject({
      providers: [],
    })
    const { commit: cmt } = await factories.createDraft({
      project: prj,
      user: usr,
    })

    workspace = wsp
    user = usr
    project = prj
    commit = cmt
  })

  it('creates a new document version in the commit', async () => {
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

  it('fails if document path is invalid', async () => {
    const paths = [
      'invalid path',
      '/invalid/path',
      'invalid:path',
      'invalid**path||ªªª!!!',
    ]

    for (const path of paths) {
      const result = await createNewDocument({
        workspace,
        user,
        commit,
        path,
      })

      expect(result.ok).toBe(false)
      expect(result.error!.message).toBe(
        "Invalid path, no spaces. Only letters, numbers, '.', '-' and '_'",
      )
    }
  })

  it('fails if there is another document with the same path', async () => {
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

  it('fails when trying to create a document in a merged commit', async () => {
    const {
      project: prj,
      user: usr,
      providers,
    } = await factories.createProject({
      workspace,
      providers: [{ type: Providers.OpenAI, name: 'MyOpenAI' }],
    })
    let { commit } = await factories.createDraft({ project: prj, user: usr })
    await createNewDocument({
      workspace,
      user,
      commit,
      path: 'foo',
      content: factories.helpers.createPrompt({ provider: providers[0]! }),
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

  it('creates a new document with default content when default provider', async () => {
    const provider = await factories.createProviderApiKey({
      workspace,
      type: Providers.Anthropic,
      name: 'Default Provider',
      defaultModel: 'claude-3-5-sonnet-latest',
      user,
    })
    await factories.setProviderAsDefault(workspace, provider)
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
temperature: 1
---

`.trimStart(),
    )
  })

  it('creates a new document with default default provider when no metadata', async () => {
    const {
      project,
      user,
      workspace: wsp,
    } = await factories.createProject({
      providers: [],
    })
    const { commit } = await factories.createDraft({ project, user })
    const provider = await factories.createProviderApiKey({
      workspace: wsp,
      type: Providers.Anthropic,
      name: 'Default Provider',
      defaultModel: 'claude-3-5-sonnet-latest',
      user,
    })
    await factories.setProviderAsDefault(wsp, provider)
    const workspacesScope = new WorkspacesRepository(user.id)
    workspace = await workspacesScope.find(wsp.id).then((r) => r.unwrap())

    const documentResult = await createNewDocument({
      workspace,
      user,
      commit,
      path: 'newdoc',
      content: 'This is my prompt',
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
temperature: 1
---

This is my prompt`.trimStart(),
    )
  })

  it('creates the document without the frontmatter if no provider is found', async () => {
    const { project, user, workspace } = await factories.createProject({
      providers: [],
    })
    const { commit } = await factories.createDraft({ project, user })

    const result = await createNewDocument({
      workspace,
      user,
      commit,
      path: 'newdoc',
    })

    expect(result.ok).toBe(true)
    const document = result.unwrap()
    expect(document.content).toBe(`---

temperature: 1
---

`)
  })

  describe('with provider', () => {
    let provider: ProviderApiKey

    beforeEach(async () => {
      provider = await factories.createProviderApiKey({
        workspace,
        type: Providers.Custom,
        name: 'First Provider',
        url: 'https://example.com',
        user,
      })
      await factories.createProviderApiKey({
        workspace,
        user,
        type: Providers.OpenAI,
        name: 'Second Provider',
        defaultModel: 'gpt-4o-mini',
      })
    })

    it('creates a new document with default content when no default provider', async () => {
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
temperature: 1
---

`.trimStart(),
      )
    })

    it('creates an agent when agent flag is passed', async () => {
      const documentResult = await createNewDocument({
        workspace,
        user,
        commit,
        path: 'my_new_agent',
        agent: true,
      })

      const document = documentResult.unwrap()
      expect(document.path).toBe('my_new_agent')

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
type: agent
temperature: 1
---

`.trimStart(),
      )
    })
  })
})
