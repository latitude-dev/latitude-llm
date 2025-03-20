import { AppRouteHandler } from '$/openApi/types'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { HEAD_COMMIT } from '@latitude-data/core/browser'
import { DeletePromptRoute } from './deletePrompt.route'
import { destroyOrSoftDeleteDocuments } from '@latitude-data/core/services/documents/destroyOrSoftDeleteDocuments'

export const deletePromptHandler: AppRouteHandler<DeletePromptRoute> = async (
  c,
) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid, documentUuid } = c.req.valid('param')

  const commitsScope = new CommitsRepository(workspace.id)
  const commitResult = await commitsScope.getCommitByUuid({
    projectId,
    uuid: versionUuid ?? HEAD_COMMIT,
  })
  const commit = commitResult.unwrap()

  const documentsScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentsScope.getDocumentAtCommit({
    projectId,
    commitUuid: versionUuid ?? HEAD_COMMIT,
    documentUuid,
  })
  const document = documentResult.unwrap()

  const result = await destroyOrSoftDeleteDocuments({
    workspace,
    commit,
    documents: [document],
  })
  result.unwrap()

  return c.newResponse(null, 204)
}
