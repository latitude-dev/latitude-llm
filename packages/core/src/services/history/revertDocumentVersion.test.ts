import { Providers } from '@latitude-data/constants'
import { describe, expect, it } from 'vitest'
import { DocumentVersionsRepository } from '../../repositories'
import { mergeCommit } from '../commits'
import {
  getChangesToRevertDocumentChanges,
  revertChangesToDocument,
} from './revertDocumentVersion'

describe('getChangesToRevertDocumentChanges', () => {
  it('fetches and computes changes for a document reversion', async (ctx) => {
    const { workspace, project, documents, user } =
      await ctx.factories.createProject({
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

    const changeResult = await getChangesToRevertDocumentChanges({
      workspace,
      project,
      targetDraftUuid: changedCommit.uuid,
      documentCommitUuid: changedCommit.uuid,
      documentUuid: document.documentUuid,
    })

    expect(changeResult.error).toBeUndefined()
    const change = changeResult.unwrap()

    expect(change).toBeDefined()
    expect(change.oldDocumentPath).toEqual('updated-path')
    expect(change.newDocumentPath).toEqual('foo')
    expect(change.content.oldValue).toEqual(updatedDocument.content)
    expect(change.content.newValue).toEqual(document.content)
  })

  it('handles errors when fetching document reversion details', async (ctx) => {
    const { workspace, project } = await ctx.factories.createProject()

    const changeResult = await getChangesToRevertDocumentChanges({
      workspace,
      project,
      targetDraftUuid: 'nonexistent',
      documentCommitUuid: 'invalid',
      documentUuid: 'invalid-doc',
    })

    expect(changeResult.error).toBeDefined()
  })
})

describe('revertChangesToDocument', () => {
  it('reverts a document properly for the specified draft', async (ctx) => {
    const { workspace, project, documents, user } =
      await ctx.factories.createProject({
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

    const revertResult = await revertChangesToDocument({
      workspace,
      project,
      user,
      targetDraftUuid: targetDraft.uuid,
      documentCommitUuid: changedCommit.uuid,
      documentUuid: document.documentUuid,
    })

    expect(revertResult.error).toBeUndefined()
    const finalDraft = revertResult.unwrap()
    expect(finalDraft.commit.uuid).toEqual(targetDraft.uuid)
    expect(finalDraft.documentUuid).toEqual(document.documentUuid)

    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const revertedDoc = await documentsScope
      .getDocumentAtCommit({
        projectId: project.id,
        commitUuid: finalDraft.commit.uuid,
        documentUuid: document.documentUuid,
      })
      .then((r) => r.value)

    expect(revertedDoc).toBeDefined()
    expect(revertedDoc?.content).toEqual(document.content)
    expect(revertedDoc?.path).toEqual(document.path)
  })

  it('creates a new draft when no target draft is provided', async (ctx) => {
    const { workspace, project, documents, user } =
      await ctx.factories.createProject({
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
    })
    const mergedCommit = await mergeCommit(changedCommit).then((r) =>
      r.unwrap(),
    )

    const revertResult = await revertChangesToDocument({
      workspace,
      project,
      user,
      documentCommitUuid: mergedCommit.uuid,
      documentUuid: document.documentUuid,
    })

    expect(revertResult.error).toBeUndefined()
    const finalDraft = revertResult.unwrap()

    expect(finalDraft.commit.title).toContain(
      `Revert changes for "${document.path}"`,
    )
    expect(finalDraft.documentUuid).toEqual(document.documentUuid)
  })

  it('returns an error if document reversion fetch fails', async (ctx) => {
    const { workspace, project, user } = await ctx.factories.createProject()

    const revertResult = await revertChangesToDocument({
      workspace,
      project,
      user,
      targetDraftUuid: 'nonexistent',
      documentCommitUuid: 'invalid-commit',
      documentUuid: 'invalid-doc',
    })

    expect(revertResult.error).toBeDefined()
  })
})
