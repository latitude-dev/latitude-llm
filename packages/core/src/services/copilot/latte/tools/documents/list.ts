import { z } from 'zod'
import { Result } from '../../../../../lib/Result'
import {
  CommitsRepository,
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
    return Result.ok(
      documents.map((document) =>
        promptPresenter({
          document,
          versionUuid,
          projectId,
        }),
      ),
    )
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
  }),
)

export default listPrompts
