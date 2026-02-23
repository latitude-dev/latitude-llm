import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { destroyDocument } from '@latitude-data/core/services/documents/destroyDocument'
import { destroyDocumentUnsafe } from '@latitude-data/core/services/documents/destroyDocumentUnsafe'
import { BadRequestError, NotFoundError } from '@latitude-data/core/lib/errors'

import type { DestroyDocumentRoute } from './destroy.route'
import { AppRouteHandler } from '$/openApi/types'
import { HEAD_COMMIT } from '@latitude-data/constants'
import { assertCanEditCommit } from '@latitude-data/core/lib/assertCanEditCommit'
import { Result } from '@latitude-data/core/lib/Result'

// @ts-expect-error: Types are not working as expected
export const destroyDocumentHandler: AppRouteHandler<
  DestroyDocumentRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid, documentPath } = c.req.valid('param')
  const { force } = c.req.valid('query')

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

  const canEditCommit = await assertCanEditCommit(commit)

  if (!Result.isOk(canEditCommit) && !force) {
    throw new BadRequestError(
      'Cannot modify a merged commit. Use force=true to allow deletions on the live commit.',
    )
  }

  const docResult = await docsScope.getDocumentByPath({
    commit,
    path: documentPath,
  })
  if (docResult.error) {
    throw new NotFoundError(`Document not found at path: ${documentPath}`)
  }
  const document = docResult.unwrap()

  if (Result.isOk(canEditCommit)) {
    await destroyDocument({ document, commit, workspace }).then((r) =>
      r.unwrap(),
    )
  } else {
    await destroyDocumentUnsafe({ document, commit, workspace }).then((r) =>
      r.unwrap(),
    )
  }

  return c.json(
    {
      documentUuid: document.documentUuid,
      path: document.path,
    },
    200,
  )
}
