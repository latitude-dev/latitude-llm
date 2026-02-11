import { documentPresenter } from '$/presenters/documentPresenter'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { createNewDocument } from '@latitude-data/core/services/documents/create'
import { NotFoundError } from '@latitude-data/core/lib/errors'

import type { CreateDocumentRoute } from './create.route'
import { AppRouteHandler } from '$/openApi/types'
import { HEAD_COMMIT } from '@latitude-data/constants'

// @ts-expect-error: Types are not working as expected
export const createDocumentHandler: AppRouteHandler<
  CreateDocumentRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid } = c.req.valid('param')
  const { path, prompt } = c.req.valid('json')

  const commitsScope = new CommitsRepository(workspace.id)

  const project = await findProjectById({
    workspaceId: workspace.id,
    id: Number(projectId!),
  })
  if (!project) {
    throw new NotFoundError('Project not found')
  }

  const commit = await commitsScope
    .getCommitByUuid({
      projectId: project.id,
      uuid: versionUuid ?? HEAD_COMMIT,
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
