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
  async ({ versionUuid }, { workspace, project }) => {
    const commitsScope = new CommitsRepository(workspace.id)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId: project.id,
      uuid: versionUuid,
    })
    if (!commitResult.ok) return commitResult
    const commit = commitResult.unwrap()

    const docsScope = new DocumentVersionsRepository(workspace.id)
    const docsResult = await docsScope.getDocumentsAtCommit(commit)
    if (!docsResult.ok) return docsResult
    const documents = docsResult.unwrap()

    const documentTriggerScope = new DocumentTriggersRepository(workspace.id)

    const existingTriggersAtCommit = await documentTriggerScope
      .getTriggersInProject({ projectId: project.id, commit })
      .then((r) => r.unwrap())

    const promptObjects = await Promise.all(
      documents.map(async (doc) => {
        const existingTriggers = existingTriggersAtCommit.filter(
          (trigger) => trigger.documentUuid === doc.documentUuid,
        )
        return promptPresenter({
          document: doc,
          versionUuid,
          projectId: project.id,
          triggers: existingTriggers,
          workspaceId: workspace.id,
        })
      }),
    )

    return Result.ok(promptObjects)
  },
  z.object({
    versionUuid: z.string(),
  }),
)

export default listPrompts
