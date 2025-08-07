import { describe, expect, it } from 'vitest'

import { getChangesToResetProjectToCommit, resetProjectToCommit } from './resetProjectToCommit'
import { Providers } from '@latitude-data/constants'
import { mergeCommit } from '../commits'

describe('getChangesToResetProjectToCommit', () => {
  it('fetches and computes changes between commits', async (ctx) => {
    const {
      workspace,
      project,
      commit: originalCommit,
      documents,
      user,
    } = await ctx.factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'foo123',
        }),
      },
    })

    const document = documents[0]!

    const { commit: targetCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    const newDocument = await ctx.factories.updateDocumentVersion({
      document,
      commit: targetCommit,
      content: document.content.replace('foo123', 'bar123'),
      path: 'bar',
    })

    const changes = await getChangesToResetProjectToCommit({
      workspace,
      project,
      targetDraftUuid: targetCommit.uuid,
      commitUuid: originalCommit.uuid,
    }).then((r) => r.unwrap())

    expect(changes).toBeInstanceOf(Array)
    expect(changes.length).toEqual(1)
    expect(changes[0]!.oldDocumentPath).toEqual('bar') // Old path in the Draft, BEFORE resetting it
    expect(changes[0]!.newDocumentPath).toEqual('foo') // New path AFTER resetting the commit.
    expect(changes[0]!.content.newValue).toEqual(document.content) // Old content in the Draft, BEFORE resetting it
    expect(changes[0]!.content.oldValue).toEqual(newDocument.content) // New content AFTER resetting the commit
  })

  it('handles errors when fetching commit details', async (ctx) => {
    const { workspace, project } = await ctx.factories.createProject()

    const result = await getChangesToResetProjectToCommit({
      workspace,
      project,
      targetDraftUuid: 'nonexistent',
      commitUuid: 'invalid',
    })

    expect(result.error).toBeDefined()
  })
})

describe('resetProjectToCommit', () => {
  it('resets the project to the specified commit', async (ctx) => {
    const {
      workspace,
      project,
      commit: originalCommit,
      documents,
      user,
    } = await ctx.factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'foo123',
        }),
      },
    })

    const document = documents[0]!

    const { commit: targetCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    await ctx.factories.updateDocumentVersion({
      document,
      commit: targetCommit,
      content: document.content.replace('foo123', 'bar123'),
      path: 'bar',
    })

    const result = await resetProjectToCommit({
      user,
      workspace,
      project,
      targetDraftUuid: targetCommit.uuid,
      commitUuid: originalCommit.uuid,
    }).then((r) => r.unwrap())

    expect(result).toBeDefined()
    expect(result.title).toEqual(targetCommit.title)
  })

  it('creates a new draft when no target draft UUID is provided', async (ctx) => {
    const {
      workspace,
      project,
      commit: firstCommit,
      documents,
      user,
    } = await ctx.factories.createProject({
      providers: [
        {
          type: Providers.OpenAI,
          name: 'openai',
        },
      ],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'foo123',
        }),
      },
    })

    const { commit: originalCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    await ctx.factories.updateDocumentVersion({
      document: documents[0]!,
      commit: originalCommit,
      content: documents[0]!.content.replace('foo123', 'bar123'),
    })

    await mergeCommit(originalCommit).then((r) => r.unwrap())

    const result = await resetProjectToCommit({
      user,
      workspace,
      project,
      commitUuid: firstCommit.uuid,
    }).then((r) => r.unwrap())

    expect(result).toBeDefined()
    expect(result.title).toContain(`Reset project to v${firstCommit.version}`)
  })

  it('returns an error if commit details cannot be fetched', async (ctx) => {
    const { workspace, project, user } = await ctx.factories.createProject()

    const result = await resetProjectToCommit({
      user,
      workspace,
      project,
      targetDraftUuid: 'nonexistent',
      commitUuid: 'invalid',
    })

    expect(result.error).toBeDefined()
  })
})
