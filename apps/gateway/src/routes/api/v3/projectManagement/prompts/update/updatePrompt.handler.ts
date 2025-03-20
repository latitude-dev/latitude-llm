import { AppRouteHandler } from '$/openApi/types'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { HEAD_COMMIT, PublishedDocument } from '@latitude-data/core/browser'
import { documentPresenter } from '../presenters'
import { PublishedDocumentRepository } from '@latitude-data/core/repositories/publishedDocumentsRepository'
import { UpdatePromptRoute } from './updatePrompt.route'
import { updateDocument } from '@latitude-data/core/services/documents/update'
import { updatePublishedDocument } from '@latitude-data/core/services/publishedDocuments/update'
import { createPublishedDocument } from '@latitude-data/core/services/publishedDocuments/create'

// @ts-expect-error: broken types
export const updatePromptHandler: AppRouteHandler<UpdatePromptRoute> = async (
  c,
) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid, documentUuid, data } = c.req.valid('param')

  const projectScope = new ProjectsRepository(workspace.id)
  const projectResult = await projectScope.getProjectById(Number(projectId))
  const project = projectResult.unwrap()

  const commitsScope = new CommitsRepository(workspace.id)
  const commitResult = await commitsScope.getCommitByUuid({
    projectId: project.id,
    uuid: versionUuid ?? HEAD_COMMIT,
  })
  const commit = commitResult.unwrap()

  const documentsScope = new DocumentVersionsRepository(workspace.id)
  const documentResult = await documentsScope.getDocumentAtCommit({
    projectId: project.id,
    commitUuid: versionUuid ?? HEAD_COMMIT,
    documentUuid,
  })
  let document = documentResult.unwrap()

  const publishedDocumentsScope = new PublishedDocumentRepository(workspace.id)
  let publishedDocument = (await publishedDocumentsScope.findByDocumentUuid(
    documentUuid,
  )) as PublishedDocument | undefined

  if (data.content || data.path) {
    const result = await updateDocument({
      commit,
      document,
      path: data.path,
      content: data.content,
    })
    document = result.unwrap()
  }

  if (data.published === false) {
    if (publishedDocument) {
      const result = await updatePublishedDocument({
        publishedDocument,
        data: { isPublished: false },
      })
      publishedDocument = result.unwrap()
    }
  } else if (data.published !== undefined) {
    const updateData = Object.fromEntries(
      Object.entries(data.published).filter(([_, v]) => v !== undefined),
    )

    if (!publishedDocument) {
      const newPublishedDocumentResult = await createPublishedDocument({
        workspace,
        project,
        document,
        commitUuid: versionUuid ?? HEAD_COMMIT,
      })
      publishedDocument = newPublishedDocumentResult.unwrap()
    }

    const updatedPublishedDocumentResult = await updatePublishedDocument({
      publishedDocument,
      data: updateData,
    })
    publishedDocument = updatedPublishedDocumentResult.unwrap()
  }

  const resultData = await documentPresenter({
    workspace,
    commit,
    document,
    publishedDocument,
  })
  return c.json(resultData, 200)
}
