import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import {
  CommitsRepository,
  DocumentTriggersRepository,
  DocumentVersionsRepository,
} from '../../../../../repositories'
import { promptPresenter } from '../presenters'
import { defineLatteTool } from '../types'

const listPrompts = defineLatteTool(
  async ({ projectId, versionUuid }, { workspace }) => {
    const commitsScope = new CommitsRepository(workspace.id)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId,
      uuid: versionUuid,
    })
    if (!commitResult.ok) return commitResult
    const commit = commitResult.unwrap()

    const docsScope = new DocumentVersionsRepository(workspace.id)
    const docsResult = await docsScope.getDocumentsAtCommit(commit)
    if (!docsResult.ok) return docsResult
    const documents = docsResult.unwrap()

    const documentTriggerScope = new DocumentTriggersRepository(workspace.id)

    const existingTriggersAtLiveCommit =
      await documentTriggerScope.findByProjectId(commit.projectId)

    const promptObjects = await Promise.all(
      documents.map(async (doc) => {
        const existingTriggers = existingTriggersAtLiveCommit.filter(
          (trigger) => trigger.documentUuid === doc.documentUuid,
        )
        return promptPresenter({
          document: doc,
          versionUuid,
          projectId,
          triggers: existingTriggers,
          workspaceId: workspace.id,
        })
      }),
    )

    return Result.ok(promptObjects)
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
  }),
)

export default listPrompts
