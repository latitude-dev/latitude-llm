import { AppRouteHandler } from '$/openApi/types'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { ReadPromptRoute } from './readPrompt.route'
import { HEAD_COMMIT } from '@latitude-data/core/browser'
import { documentPresenter } from '../presenters'
import { PublishedDocumentRepository } from '@latitude-data/core/repositories/publishedDocumentsRepository'

// @ts-expect-error: broken types
export const readPromptHandler: AppRouteHandler<ReadPromptRoute> = async (
  c,
) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid, documentUuid } = c.req.valid('param')

  const commitScope = new CommitsRepository(workspace.id)
  const commitResult = await commitScope.getCommitByUuid({
    projectId: Number(projectId),
    uuid: versionUuid ?? HEAD_COMMIT,
  })
  const commit = commitResult.unwrap()

  const documentsScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentsScope.getDocumentAtCommit({
    projectId: Number(projectId),
    commitUuid: commit.uuid,
    documentUuid,
  })
  const document = documentResult.unwrap()

  const publishedDocumentsScope = new PublishedDocumentRepository(workspace.id)
  const publishedDocument =
    await publishedDocumentsScope.findByDocumentUuid(documentUuid)

  const data = await documentPresenter({
    workspace,
    commit,
    document,
    publishedDocument,
  })
  return c.json(data, 200)
}
