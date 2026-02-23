import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { destroyDocument } from '@latitude-data/core/services/documents/destroyDocument'
import { NotFoundError } from '@latitude-data/core/lib/errors'

import type { DestroyDocumentRoute } from './destroy.route'
import { AppRouteHandler } from '$/openApi/types'
import { HEAD_COMMIT } from '@latitude-data/constants'

// @ts-expect-error: Types are not working as expected
export const destroyDocumentHandler: AppRouteHandler<
  DestroyDocumentRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid, documentPath } = c.req.valid('param')

  const commitsScope = new CommitsRepository(workspace.id)
  const docsScope = new DocumentVersionsRepository(workspace.id)

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

  const docResult = await docsScope.getDocumentByPath({
    commit,
    path: documentPath,
  })
  if (docResult.error) {
    throw new NotFoundError(`Document not found at path: ${documentPath}`)
  }
  const document = docResult.unwrap()

  await destroyDocument({ document, commit, workspace }).then((r) =>
    r.unwrap(),
  )

  return c.json(
    {
      documentUuid: document.documentUuid,
      path: document.path,
    },
    200,
  )
}
