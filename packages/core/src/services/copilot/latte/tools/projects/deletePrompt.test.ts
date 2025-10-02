import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@latitude-data/constants'
import deletePrompt from './deletePrompt'
import { DocumentVersionsRepository } from '../../../../../repositories'
import { Commit, Project, User, Workspace } from '../../../../../schema/types'
import * as factories from '../../../../../tests/factories'
import { createLatteThread } from '../../threads/createThread'
import { LatteToolContext } from '../types'
import { WebsocketClient } from '../../../../../websockets/workers'
import { mergeCommit } from '../../../../commits'

vi.spyOn(WebsocketClient, 'sendEvent').mockImplementation(vi.fn())

describe('deletePrompt', () => {
  let workspace: Workspace
  let user: User
  let project: Project
  let draft: Commit

  let latteContext: LatteToolContext

  beforeEach(async () => {
    const {
      workspace: w,
      user: u,
      project: p,
      commit: c,
    } = await factories.createProject({
      providers: [{ type: Providers.OpenAI, name: 'openai' }],
      skipMerge: true,
    })

    workspace = w
    user = u
    project = p
    draft = c

    const latteThread = await createLatteThread({
      workspace,
      user,
      project,
    }).then((r) => r.unwrap())

    // @ts-expect-error Only defining stuff being used in deletePrompt
    latteContext = {
      workspace,
      project,
      user,
      threadUuid: latteThread.uuid,
    }
  })

  it('deletes an existing prompt in a draft', async () => {
    const path = 'prompts/to-delete'
    const content = 'This prompt will be deleted'

    const { documentVersion } = await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: path,
      content: content,
    })

    const result = await deletePrompt(
      {
        versionUuid: draft.uuid,
        path: path,
      },
      latteContext,
    )

    expect(result.ok).toBe(true)
    const {
      success,
      deletedPromptUuid,
      path: deletedPath,
    } = result.unwrap() as {
      success: boolean
      deletedPromptUuid: string
      path: string
    }
    expect(success).toBe(true)
    expect(deletedPromptUuid).toBe(documentVersion.documentUuid)
    expect(deletedPath).toBe(path)

    // Verify the document was soft deleted by checking with includeDeleted option
    const documentScope = new DocumentVersionsRepository(
      workspace.id,
      undefined,
      { includeDeleted: true },
    )
    const docsIncludingDeleted = await documentScope
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())

    const deletedDoc = docsIncludingDeleted.find(
      (doc) => doc.documentUuid === documentVersion.documentUuid,
    )
    expect(deletedDoc).toBeDefined()
    expect(deletedDoc!.deletedAt).not.toBeNull()

    // Verify that getDocumentsAtCommit without includeDeleted returns empty array
    const normalScope = new DocumentVersionsRepository(workspace.id)
    const normalDocs = await normalScope
      .getDocumentsAtCommit(draft)
      .then((r) => r.unwrap())
    expect(normalDocs).toHaveLength(0)
  })

  it('returns an error when trying to delete a non-existent prompt', async () => {
    const nonExistentPath = 'prompts/non-existent-path'

    const result = await deletePrompt(
      {
        versionUuid: draft.uuid,
        path: nonExistentPath,
      },
      latteContext,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error!.message).toContain('not found')
  })

  it('returns an error when trying to delete from a merged commit', async () => {
    const path = 'prompts/in-merged-commit'
    const content = 'Content in merged commit'

    // Create a document in the draft first
    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: path,
      content: content,
    })

    // Merge the commit
    await mergeCommit(draft)

    const result = await deletePrompt(
      {
        versionUuid: draft.uuid,
        path: path,
      },
      latteContext,
    )

    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error!.message).toContain('Cannot edit a merged commit')
  })

  it('handles deleting a prompt that was already deleted', async () => {
    const path = 'prompts/already-deleted'
    const content = 'This prompt is already deleted'

    await factories.createDocumentVersion({
      workspace,
      user,
      commit: draft,
      path: path,
      content: content,
    })

    // First deletion
    const firstResult = await deletePrompt(
      {
        versionUuid: draft.uuid,
        path: path,
      },
      latteContext,
    )

    expect(firstResult.ok).toBe(true)

    // After first deletion, the document still exists in the commit (just marked as deleted)
    // A second deletion attempt should fail because our implementation fetches documents
    // without includeDeleted, so it won't find the document
    const secondResult = await deletePrompt(
      {
        versionUuid: draft.uuid,
        path: path,
      },
      latteContext,
    )

    expect(secondResult.ok).toBe(false)
    expect(secondResult.error!.message).toContain('not found')
  })
})
