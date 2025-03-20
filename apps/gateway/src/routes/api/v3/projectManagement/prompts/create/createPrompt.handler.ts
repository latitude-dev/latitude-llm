import { AppRouteHandler } from '$/openApi/types'
import {
  CommitsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { HEAD_COMMIT } from '@latitude-data/core/browser'
import { documentPresenter, publishedDocumentPresenter } from '../presenters'
import { CreatePromptRoute } from './createPrompt.route'
import { updatePublishedDocument } from '@latitude-data/core/services/publishedDocuments/update'
import { createPublishedDocument } from '@latitude-data/core/services/publishedDocuments/create'
import { createNewDocument } from '@latitude-data/core/services/documents/create'

// @ts-expect-error: broken types
export const createPromptHandler: AppRouteHandler<CreatePromptRoute> = async (
  c,
) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid, data } = c.req.valid('param')

  const projectScope = new ProjectsRepository(workspace.id)
  const projectResult = await projectScope.getProjectById(Number(projectId))
  const project = projectResult.unwrap()

  const commitsScope = new CommitsRepository(workspace.id)
  const commitResult = await commitsScope.getCommitByUuid({
    projectId: project.id,
    uuid: versionUuid ?? HEAD_COMMIT,
  })
  const commit = commitResult.unwrap()

  const newDocumentResult = await createNewDocument({
    workspace,
    commit,
    path: data.path,
    content: data.content,
  })

  const document = newDocumentResult.unwrap()
  const result = await documentPresenter({ workspace, commit, document })

  if (data.published) {
    const newPublishedDocumentResult = await createPublishedDocument({
      workspace,
      project,
      document,
      commitUuid: versionUuid ?? HEAD_COMMIT,
    })
    const publishedDocument = newPublishedDocumentResult.unwrap()

    const updatedPublishedDocumentResult = await updatePublishedDocument({
      publishedDocument,
      data: {
        title: data.published.title,
        description: data.published.description,
        canFollowConversation: data.published.canChat,
        isPublished: true,
      },
    })
    const updatedPublishedDocument = updatedPublishedDocumentResult.unwrap()
    result.published = publishedDocumentPresenter(updatedPublishedDocument)
  }

  return c.json(result, 201)
}
