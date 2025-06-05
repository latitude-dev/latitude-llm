import { LatitudeError } from '@latitude-data/constants/errors'
import { ErrorResult, Result } from '../../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../../repositories'
import { defineLatteTool } from '../types'
import { z } from 'zod'

const readPrompt = defineLatteTool(
  async ({ projectId, versionUuid, path }, { workspace }) => {
    const commitsScope = new CommitsRepository(workspace.id)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId: projectId,
      uuid: versionUuid,
    })
    if (!commitResult.ok) return commitResult
    const commit = commitResult.unwrap()

    const docsScope = new DocumentVersionsRepository(workspace.id)

    const docResult = await docsScope.getDocumentByPath({
      path,
      commit,
    })
    if (!docResult.ok) return docResult as ErrorResult<LatitudeError>

    const document = docResult.unwrap()
    return Result.ok(document.content)
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
    path: z.string(),
  }),
)

export default readPrompt
