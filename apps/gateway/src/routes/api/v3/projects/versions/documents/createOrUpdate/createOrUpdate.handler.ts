import { documentPresenter } from '$/presenters/documentPresenter'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { createNewDocumentUnsafe } from '@latitude-data/core/services/documents/createUnsafe'
import { updateDocumentUnsafe } from '@latitude-data/core/services/documents/updateUnsafe'
import { BadRequestError } from '@latitude-data/core/lib/errors'

import type { CreateOrUpdateDocumentRoute } from './createOrUpdate.route'
import { AppRouteHandler } from '$/openApi/types'
import { HEAD_COMMIT } from '@latitude-data/constants'
import { assertCanEditCommit } from '@latitude-data/core/lib/assertCanEditCommit'
import { Result } from '@latitude-data/core/lib/Result'

// @ts-expect-error: Types are not working as expected
export const createOrUpdateDocumentHandler: AppRouteHandler<
  CreateOrUpdateDocumentRoute
> = async (c) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid } = c.req.valid('param')
  const { path, prompt, force } = c.req.valid('json')

  const projectsScope = new ProjectsRepository(workspace.id)
  const commitsScope = new CommitsRepository(workspace.id)
  const docsScope = new DocumentVersionsRepository(workspace.id)

  const project = await projectsScope
    .getProjectById(Number(projectId!))
    .then((r) => r.unwrap())

  const commit = await commitsScope
    .getCommitByUuid({
      projectId: project.id,
      uuid: versionUuid ?? HEAD_COMMIT,
    })
    .then((r) => r.unwrap())
  const canEditCommit = await assertCanEditCommit(commit)

  // Check if this is a merged commit (live commit)
  if (!Result.isOk(canEditCommit) && !force) {
    throw new BadRequestError(
      'Cannot modify a merged commit. Use force=true to allow modifications to the live commit.',
    )
  }

  // Try to get existing document
  const docResult = await docsScope.getDocumentByPath({ commit, path })

  let document
  if (docResult.ok) {
    // Document exists, update it using unsafe version
    const existingDoc = docResult.unwrap()
    document = await updateDocumentUnsafe({
      commit,
      document: existingDoc,
      data: {
        content: prompt,
      },
    }).then((r) => r.unwrap())
  } else {
    // Document doesn't exist, create it using unsafe version
    document = await createNewDocumentUnsafe({
      workspace,
      commit,
      path,
      content: prompt,
    }).then((r) => r.unwrap())
  }

  const data = await documentPresenter({
    document,
    commit,
    workspace,
  })

  return c.json(data, 200)
}
