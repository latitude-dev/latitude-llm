import { describe, expect, it } from 'vitest'
import {
  getChangesToResetDocumentToVersion,
  resetDocumentToVersion,
} from './resetDocumentToVersion'
import { Providers } from '@latitude-data/constants'
import { mergeCommit } from '../commits'
import { DocumentVersionsRepository } from '../../repositories'

describe('getChangesToResetDocumentToVersion', () => {
  it('fetches and computes changes for a document between versions', async (ctx) => {
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
          content: 'initial content',
        }),
      },
    })

    const document = documents[0]!

    const { commit: targetCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    const updatedDocument = await ctx.factories.updateDocumentVersion({
      document,
      commit: targetCommit,
      content: document.content.replace('initial content', 'updated content'),
      path: 'updated-path',
    })

    const change = await getChangesToResetDocumentToVersion({
      workspace,
      project,
      documentUuid: document.documentUuid,
      targetDraftUuid: targetCommit.uuid,
      documentCommitUuid: originalCommit.uuid,
    }).then((r) => r.unwrap())

    expect(change).toBeDefined()
    expect(change.oldDocumentPath).toEqual('updated-path')
    expect(change.newDocumentPath).toEqual('foo')
    expect(change.content.oldValue).toEqual(updatedDocument.content)
    expect(change.content.newValue).toEqual(document.content)
  })

  it('handles errors when fetching commit details', async (ctx) => {
    const { workspace, project } = await ctx.factories.createProject()

    const result = await getChangesToResetDocumentToVersion({
      workspace,
      project,
      documentUuid: 'nonexistent',
      targetDraftUuid: 'nonexistent',
      documentCommitUuid: 'invalid',
    })

    expect(result.error).toBeDefined()
  })
})

describe('resetDocumentToVersion', () => {
  it('resets a document to the specified version', async (ctx) => {
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
          content: 'initial content',
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
      content: 'updated content',
    })

    const result = await resetDocumentToVersion({
      workspace,
      project,
      user,
      documentUuid: document.documentUuid,
      targetDraftUuid: targetCommit.uuid,
      documentCommitUuid: originalCommit.uuid,
    }).then((r) => r.unwrap())

    expect(result).toBeDefined()
    expect(result.commit).toEqual(targetCommit)
    expect(result.documentUuid).toEqual(document.documentUuid)
  })

  it('returns an error if commit details cannot be fetched', async (ctx) => {
    const { workspace, project, user } = await ctx.factories.createProject()

    const result = await resetDocumentToVersion({
      workspace,
      project,
      user,
      documentUuid: 'nonexistent',
      targetDraftUuid: 'nonexistent',
      documentCommitUuid: 'invalid',
    })

    expect(result.error).toBeDefined()
  })

  it('creates a new draft when no target commit UUID is provided', async (ctx) => {
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
          content: 'initial content',
        }),
      },
    })

    const document = documents[0]!

    const { commit: originalCommit } = await ctx.factories.createDraft({
      project,
      user,
    })

    await ctx.factories.updateDocumentVersion({
      document,
      commit: originalCommit,
      content: document.content.replace('initial content', 'updated content'),
    })

    await mergeCommit(originalCommit).then((r) => r.unwrap())

    const result = await resetDocumentToVersion({
      workspace,
      project,
      user,
      documentUuid: document.documentUuid,
      targetDraftUuid: undefined,
      documentCommitUuid: firstCommit.uuid,
    }).then((r) => r.unwrap())

    expect(result).toBeDefined()
    expect(result.commit.title).toContain(`Reset "${document.path}"`)
    expect(result.documentUuid).toEqual(document.documentUuid)

    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const newDocument = await documentsScope
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: result.commit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.unwrap())

    expect(newDocument.content).toEqual(document.content)
  })
})
