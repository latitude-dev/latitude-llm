import { describe, expect, it } from 'vitest'
import { getChangesToRevertCommit, revertCommit } from './revertCommit'
import { Providers } from '@latitude-data/constants'
import { mergeCommit } from '../commits'
import { DocumentVersionsRepository } from '../../repositories'

describe('getChangesToRevertCommit', () => {
  it('fetches and computes changes for a commit reversion', async (ctx) => {
    const { workspace, project, documents, user } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'initial content',
        }),
      },
    })

    const document = documents[0]!

    const { commit: changedCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    const updatedDocument = await ctx.factories.updateDocumentVersion({
      document,
      commit: changedCommit,
      content: 'updated content',
      path: 'updated-path',
    })

    const changes = await getChangesToRevertCommit({
      workspace,
      project,
      targetDraftUuid: changedCommit.uuid,
      commitUuid: changedCommit.uuid,
    }).then((r) => r.unwrap())

    expect(changes).toBeInstanceOf(Array)
    expect(changes.length).toBeGreaterThan(0)

    const change = changes[0]!
    expect(change.oldDocumentPath).toEqual('updated-path')
    expect(change.newDocumentPath).toEqual('foo')
    expect(change.content.oldValue).toEqual(updatedDocument.content)
    expect(change.content.newValue).toEqual(document.content)
  })

  it('handles errors when fetching commit reversion details', async (ctx) => {
    const { workspace, project } = await ctx.factories.createProject()

    const result = await getChangesToRevertCommit({
      workspace,
      project,
      targetDraftUuid: 'nonexistent',
      commitUuid: 'invalid',
    })

    expect(result.error).toBeDefined()
  })
})

describe('revertCommit', () => {
  it('reverts a commit properly', async (ctx) => {
    const { workspace, project, documents, user } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'initial content',
        }),
      },
    })

    const document = documents[0]!

    const { commit: changedCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await ctx.factories.updateDocumentVersion({
      document,
      commit: changedCommit,
      content: document.content.replace('initial content', 'updated content'),
      path: 'updated-path',
    })

    await mergeCommit(changedCommit).then((r) => r.unwrap())

    const { commit: targetDraft } = await ctx.factories.createDraft({
      project,
      user,
    })

    const revertResult = await revertCommit({
      workspace,
      project,
      user,
      targetDraftUuid: targetDraft.uuid,
      commitUuid: changedCommit.uuid,
    }).then((r) => r.unwrap())

    expect(revertResult).toBeDefined()
    expect(revertResult.title).toEqual(targetDraft.title)

    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const revertedDocument = await documentsScope
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: revertResult.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.value)
    expect(revertedDocument!.content).toEqual(document.content)
  })

  it('creates a new draft when no target draft is provided', async (ctx) => {
    const { workspace, project, documents, user } = await ctx.factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      documents: {
        foo: ctx.factories.helpers.createPrompt({
          provider: 'openai',
          content: 'initial content',
        }),
      },
    })

    const document = documents[0]!

    const { commit: changedCommit } = await ctx.factories.createDraft({
      project,
      user,
    })
    await ctx.factories.updateDocumentVersion({
      document: documents[0]!,
      commit: changedCommit,
      content: document.content.replace('initial content', 'updated content'),
    })

    const mergedChangedCommit = await mergeCommit(changedCommit).then((r) => r.unwrap())

    const revertResult = await revertCommit({
      workspace,
      project,
      user,
      commitUuid: changedCommit.uuid,
    }).then((r) => r.unwrap())

    expect(revertResult).toBeDefined()
    expect(revertResult.title).toContain(
      `Revert changes for v${mergedChangedCommit.version} "${mergedChangedCommit.title}"`,
    )
  })

  it('returns an error if commit reversion fetch fails', async (ctx) => {
    const { workspace, project, user } = await ctx.factories.createProject()

    const result = await revertCommit({
      workspace,
      project,
      user,
      targetDraftUuid: 'nonexistent',
      commitUuid: 'invalid',
    })

    expect(result.error).toBeDefined()
  })
})
