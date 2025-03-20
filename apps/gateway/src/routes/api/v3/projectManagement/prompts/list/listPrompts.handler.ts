import { AppRouteHandler } from '$/openApi/types'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { ListPromptsRoute } from './listPrompts.route'
import { HEAD_COMMIT } from '@latitude-data/core/browser'
import { documentListPresenter } from '../presenters'
import { PublishedDocumentRepository } from '@latitude-data/core/repositories/publishedDocumentsRepository'

// @ts-expect-error: broken types
export const listPromptsHandler: AppRouteHandler<ListPromptsRoute> = async (
  c,
) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid } = c.req.valid('param')

  const commitsScope = new CommitsRepository(workspace.id)
  const commitResult = await commitsScope.getCommitByUuid({
    projectId: Number(projectId),
    uuid: versionUuid ?? HEAD_COMMIT,
  })
  const commit = commitResult.unwrap()

  const documentsScope = new DocumentVersionsRepository(workspace.id)
  const documentsResult = await documentsScope.getDocumentsAtCommit(commit)
  const documents = documentsResult.unwrap()

  const publishedDocumentsScope = new PublishedDocumentRepository(workspace.id)
  const publishedDocuments = await publishedDocumentsScope.findByProject(
    Number(projectId),
  )

  const data = documentListPresenter({ documents, publishedDocuments })
  return c.json(data, 200)
}
