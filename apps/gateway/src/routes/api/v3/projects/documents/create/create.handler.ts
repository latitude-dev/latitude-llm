import { documentPresenter } from '$/presenters/documentPresenter'
import {
  CommitsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { createNewDocument } from '@latitude-data/core/services/documents/create'

import type { CreateDocumentRoute } from './create.route'
import { AppRouteHandler } from '$/openApi/types'
import { HEAD_COMMIT } from '@latitude-data/constants'

// @ts-expect-error: Types are not working as expected
export const createDocumentHandler: AppRouteHandler<
  CreateDocumentRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { projectId, commitUuid } = c.req.valid('param')
  const { path, prompt } = c.req.valid('json')

  const projectsScope = new ProjectsRepository(workspace.id)
  const commitsScope = new CommitsRepository(workspace.id)

  const project = await projectsScope
    .getProjectById(Number(projectId!))
    .then((r) => r.unwrap())

  const commit = await commitsScope
    .getCommitByUuid({
      projectId: project.id,
      uuid: commitUuid ?? HEAD_COMMIT,
    })
    .then((r) => r.unwrap())

  const document = await createNewDocument({
    workspace,
    commit,
    path,
    content: prompt,
  }).then((r) => r.unwrap())

  const data = await documentPresenter({
    document,
    commit,
    workspace,
  })

  return c.json(data, 200)
}
