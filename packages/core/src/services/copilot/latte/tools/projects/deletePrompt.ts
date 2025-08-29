import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { Result } from '../../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../../repositories'
import { defineLatteTool } from '../types'
import { LatteEditAction } from '@latitude-data/constants/latte'
import { z } from 'zod'
import { executeLatteActions } from './latteActions/executeActions'

const deletePrompt = defineLatteTool(
  async (
    { projectId, versionUuid, path: rawPath },
    { workspace, threadUuid },
  ) => {
    const commitsScope = new CommitsRepository(workspace.id)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId: projectId,
      uuid: versionUuid,
    })
    if (!commitResult.ok) return commitResult
    const commit = commitResult.unwrap()

    if (commit.mergedAt) {
      return Result.error(
        new BadRequestError(
          `Cannot edit a merged commit. Select an existing draft or create a new one.`,
        ),
      )
    }

    const documentsScope = new DocumentVersionsRepository(workspace.id)
    const documents = await documentsScope
      .getDocumentsAtCommit(commit)
      .then((r) => r.unwrap())

    const path = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath
    const document = documents.find((doc) => doc.path === path)
    if (!document) {
      return Result.error(
        new NotFoundError(
          `Document with path ${path} not found in commit ${versionUuid}.`,
        ),
      )
    }

    const latteAction: LatteEditAction = {
      type: 'prompt',
      operation: 'delete',
      promptUuid: document.documentUuid,
    }

    const actionResults = await executeLatteActions({
      workspace,
      threadUuid,
      commit,
      documents,
      actions: [latteAction],
    })
    if (!actionResults.ok) {
      return Result.error(actionResults.error!)
    }
    const { changes } = actionResults.unwrap()

    if (changes.length !== 1) {
      return Result.error(
        new BadRequestError(
          `Expected exactly one document change, but got ${changes.length}.`,
        ),
      )
    }

    return Result.ok({
      success: true,
      deletedPromptUuid: document.documentUuid,
      path,
    })
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
    path: z.string(),
  }),
)

export default deletePrompt
