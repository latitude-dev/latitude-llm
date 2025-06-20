import { describe, expect, it } from 'vitest'

import { Providers } from '../../constants'
import { DocumentVersionsRepository } from '../../repositories'
import { persistPushChanges, PushChangeDocument } from './persistPushChanges'

describe('persistPushChanges', () => {
  it('should add new documents', async (ctx) => {
    const { project, workspace, user } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
    })
    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    // Define changes to push
    const documents: PushChangeDocument[] = [
      {
        path: 'new-document',
        content: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Hello World',
        }),
        status: 'added',
      },
    ]

    // Push changes
    const result = await persistPushChanges({
      commit: draftCommit,
      workspace,
      changes: documents,
    })

    expect(result.ok).toBe(true)

    // Verify document was created
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const docsAtCommit = await docsScope
      .getDocumentsAtCommit(draftCommit)
      .then((r) => r.unwrap())

    expect(docsAtCommit.length).toBe(1)
    expect(docsAtCommit[0]!.path).toBe('new-document')
    expect(docsAtCommit[0]!.content).toContain('Hello World')
  })

  it('should update existing documents', async (ctx) => {
    // Create a project with a document
    const initialContent = ctx.factories.helpers.createPrompt({
      provider: 'openai',
      content: 'Initial content',
    })
    const { project, workspace, user } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'existing-doc': initialContent,
      },
    })

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    // Define changes to push
    const pushDocuments: PushChangeDocument[] = [
      {
        path: 'existing-doc',
        content: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Updated content',
        }),
        status: 'modified',
      },
    ]

    // Push changes
    const result = await persistPushChanges({
      commit: draftCommit,
      workspace,
      changes: pushDocuments,
    })

    expect(result.ok).toBe(true)

    // Verify document was updated
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const docsAtCommit = await docsScope
      .getDocumentsAtCommit(draftCommit)
      .then((r) => r.unwrap())

    expect(docsAtCommit.length).toBe(1)
    expect(docsAtCommit[0]!.path).toBe('existing-doc')
    expect(docsAtCommit[0]!.content).toContain('Updated content')
  })

  it('should delete documents', async (ctx) => {
    // Create a project with a document
    const initialContent = ctx.factories.helpers.createPrompt({
      provider: 'openai',
      content: 'Content to delete',
    })
    const { project, workspace, user } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'doc-to-delete': initialContent,
      },
    })

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    // Define changes to push
    const pushDocuments: PushChangeDocument[] = [
      {
        path: 'doc-to-delete',
        content: '',
        status: 'deleted',
      },
    ]

    // Push changes
    const result = await persistPushChanges({
      commit: draftCommit,
      workspace,
      changes: pushDocuments,
    })

    expect(result.ok).toBe(true)

    // Verify document was deleted
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const docsAtCommit = await docsScope
      .getDocumentsAtCommit(draftCommit)
      .then((r) => r.unwrap())

    expect(docsAtCommit.length).toBe(0)
  })

  it('should handle multiple operations at once', async (ctx) => {
    // Create a project with documents
    const { project, workspace, user } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        'doc-to-update': ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Update me',
        }),
        'doc-to-delete': ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Delete me',
        }),
      },
    })

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    // Define changes to push
    const pushDocuments: PushChangeDocument[] = [
      {
        path: 'doc-to-update',
        content: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Updated content',
        }),
        status: 'modified',
      },
      {
        path: 'doc-to-delete',
        content: '',
        status: 'deleted',
      },
      {
        path: 'new-document',
        content: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'New content',
        }),
        status: 'added',
      },
    ]

    // Push changes
    const result = await persistPushChanges({
      commit: draftCommit,
      workspace,
      changes: pushDocuments,
    })

    expect(result.ok).toBe(true)

    // Verify changes
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const docsAtCommit = await docsScope
      .getDocumentsAtCommit(draftCommit)
      .then((r) => r.unwrap())

    expect(docsAtCommit.length).toBe(2)

    const paths = docsAtCommit.map((d) => d.path)
    expect(paths).toContain('doc-to-update')
    expect(paths).toContain('new-document')
    expect(paths).not.toContain('doc-to-delete')

    const updatedDoc = docsAtCommit.find((d) => d.path === 'doc-to-update')
    expect(updatedDoc?.content).toContain('Updated content')

    const newDoc = docsAtCommit.find((d) => d.path === 'new-document')
    expect(newDoc?.content).toContain('New content')
  })

  it('should fail if commit is not a draft', async (ctx) => {
    // Create a project with a merged commit
    const { workspace, commit } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
    })

    // Define changes to push
    const pushDocuments: PushChangeDocument[] = [
      {
        path: 'new-document',
        content: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Hello World',
        }),
        status: 'added',
      },
    ]

    // Push changes should fail because commit is already merged
    const result = await persistPushChanges({
      commit, // Using merged commit
      workspace,
      changes: pushDocuments,
    })

    expect(result.ok).toBe(false)
    expect(result.error?.message).toContain('Cannot modify a merged commit')
  })

  it('should ignore unchanged documents', async (ctx) => {
    // Create a project with a document
    const { project, workspace, user } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
    })

    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    // Define changes with some unchanged documents
    const pushDocuments: PushChangeDocument[] = [
      {
        path: 'new-document',
        content: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'New content',
        }),
        status: 'added',
      },
      {
        path: 'unchanged-doc',
        content: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'Unchanged',
        }),
        status: 'unchanged',
      },
    ]

    // Push changes
    const result = await persistPushChanges({
      commit: draftCommit,
      workspace,
      changes: pushDocuments,
    })

    expect(result.ok).toBe(true)

    // Verify only the new document was created
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const docsAtCommit = await docsScope
      .getDocumentsAtCommit(draftCommit)
      .then((r) => r.unwrap())

    expect(docsAtCommit.length).toBe(1)
    expect(docsAtCommit[0]!.path).toBe('new-document')
  })

  it('should return commit if no changes were made', async (ctx) => {
    // Create a project
    const { project, workspace, user } = await ctx.factories.createProject()
    const { commit: draftCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    // Push with only unchanged documents
    const result = await persistPushChanges({
      commit: draftCommit,
      workspace,
      changes: [
        {
          path: 'unchanged-doc',
          content: 'Unchanged content',
          status: 'unchanged',
        },
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.value).toEqual(draftCommit)

    // Verify no documents were created
    const docsScope = new DocumentVersionsRepository(workspace.id)
    const docsAtCommit = await docsScope
      .getDocumentsAtCommit(draftCommit)
      .then((r) => r.unwrap())
    expect(docsAtCommit.length).toBe(0)
  })
})
