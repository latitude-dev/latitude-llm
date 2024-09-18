import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { database } from '../../client'
import { Providers } from '../../constants'
import { findHeadCommit } from '../../data-access/commits'
import { documentVersions } from '../../schema'
import { createNewDocument, updateDocument } from '../documents'
import { mergeCommit } from './merge'

describe('mergeCommit', () => {
  it('merges a commit', async (ctx) => {
    const { project, user, providers } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

    await createNewDocument({
      commit,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({ provider: providers[0]! }),
    })

    const mergedCommit = await mergeCommit(commit).then((r) => r.unwrap())
    expect(mergedCommit.mergedAt).toBeTruthy()
    expect(mergedCommit.version).toBe(1)

    const headCommit = await findHeadCommit({ projectId: project.id }).then(
      (r) => r.unwrap(),
    )
    expect(headCommit.id).toBe(mergedCommit.id)
  })

  it('fails when trying to merge a merged commit', async (ctx) => {
    const { commit } = await ctx.factories.createProject()
    const res = await mergeCommit(commit)
    expect(res.ok).toBe(false)
  })

  it('recomputes all changes in the commit', async (ctx) => {
    const { project, user, providers } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

    await createNewDocument({
      commit,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({ provider: providers[0]! }),
    })

    const currentChanges = await database.query.documentVersions.findMany({
      where: eq(documentVersions.commitId, commit.id),
    })

    expect(currentChanges.length).toBe(1)
    expect(currentChanges[0]!.path).toBe('foo')
    expect(currentChanges[0]!.resolvedContent).toBeNull()

    await mergeCommit(commit)

    const mergedChanges = await database.query.documentVersions.findMany({
      where: eq(documentVersions.commitId, commit.id),
    })

    expect(mergedChanges.length).toBe(1)
    expect(mergedChanges[0]!.path).toBe('foo')
    expect(mergedChanges[0]!.resolvedContent).toBeDefined()
  })

  it('fails when trying to merge a commit with syntax errors', async (ctx) => {
    const { project, user, providers } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })

    await createNewDocument({
      commit,
      path: 'foo',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: '<foo',
      }),
    })

    const res = await mergeCommit(commit)
    expect(res.ok).toBe(false)
  })

  it('fails when trying to merge a commit with no changes', async (ctx) => {
    const { project, user } = await ctx.factories.createProject()
    const { commit } = await ctx.factories.createDraft({ project, user })
    const res = await mergeCommit(commit)
    expect(res.ok).toBe(false)
  })

  it('detects with a new document version does not actually change anything', async (ctx) => {
    const originalContent = ctx.factories.helpers.createPrompt({
      provider: 'openai',
      content: 'foo',
    })

    const { project, user, documents } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        foo: originalContent,
      },
    })

    const { commit } = await ctx.factories.createDraft({ project, user })
    await updateDocument({
      commit,
      document: documents[0]!,
      content: ctx.factories.helpers.createPrompt({
        provider: 'openai',
        content: 'bar',
      }),
    })

    await updateDocument({
      commit,
      document: documents[0]!,
      content: originalContent, // back to the original content
    })

    const res = await mergeCommit(commit)
    expect(res.ok).toBe(false)
  })

  it('increases the version number of the commit', async (ctx) => {
    const { project, user, providers } = await ctx.factories.createProject()
    const { commit: commit1 } = await ctx.factories.createDraft({
      project,
      user,
    })

    const doc = await createNewDocument({
      commit: commit1,
      path: 'foo1',
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'foo1',
      }),
    }).then((r) => r.unwrap())

    const mergedCommit1 = await mergeCommit(commit1).then((r) => r.unwrap())
    expect(mergedCommit1.version).toBe(1)

    const { commit: commit2 } = await ctx.factories.createDraft({
      project,
      user,
    })

    await updateDocument({
      document: doc,
      commit: commit2,
      content: ctx.factories.helpers.createPrompt({
        provider: providers[0]!,
        content: 'foo2',
      }),
    }).then((r) => r.unwrap())

    const mergedCommit2 = await mergeCommit(commit2).then((r) => r.unwrap())
    expect(mergedCommit2.version).toBe(2)
  })
})
