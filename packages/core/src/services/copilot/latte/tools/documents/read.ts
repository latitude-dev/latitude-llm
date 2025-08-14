import { LatitudeError } from '@latitude-data/constants/errors'
import { ErrorResult, Result } from '../../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../../repositories'
import { defineLatteTool } from '../types'
import { z } from 'zod'
import { scanDocuments } from '../../helpers'

const readPrompt = defineLatteTool(
  async ({ projectId, versionUuid, path: rawPath }, { workspace }) => {
    const commitsScope = new CommitsRepository(workspace.id)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId: projectId,
      uuid: versionUuid,
    })
    if (!commitResult.ok) return commitResult
    const commit = commitResult.unwrap()

    const docsScope = new DocumentVersionsRepository(workspace.id)
    const documentsResult = await docsScope.getDocumentsAtCommit(commit)
    if (!documentsResult.ok) {
      return Result.error(documentsResult.error!)
    }
    const documents = documentsResult.unwrap()

    const path = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath
    const document = documents.find((doc) => doc.path === path)
    if (!document) {
      return Result.error(
        new LatitudeError(
          `Document with path "${path}" not found in commit ${commit.uuid}.`,
        ),
      )
    }

    const metadataResult = await scanDocuments({
      documents,
      commit,
      workspace,
    })
    if (!metadataResult.ok) return metadataResult as ErrorResult<LatitudeError>
    const metadatas = metadataResult.unwrap()
    const metadata = metadatas[document.path]
    return Result.ok({
      content: document.content,
      errors: metadata?.errors,
      parameters: metadata?.parameters,
    })
  },
  z.object({
    projectId: z.number(),
    versionUuid: z.string(),
    path: z.string(),
  }),
)

export default readPrompt
