import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { createNewDocument } from '@latitude-data/core/services/documents/create'
import { documentPresenter } from '$/presenters/documentPresenter'
import { AppRouteHandler } from '$/openApi/types'
import { GetOrCreateRoute } from './getOrCreate.route'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'

async function getOrCreateDocument({
  workspace,
  commit,
  path,
  content,
}: {
  workspace: Workspace
  commit: Commit
  path: string
  content?: string
}) {
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const docResult = await docsScope.getDocumentByPath({ commit, path: path })
  if (docResult.ok) return docResult.unwrap()

  return await createNewDocument({
    workspace,
    commit,
    path,
    content,
  }).then((r) => r.unwrap())
}

// @ts-expect-error: Types are not working as expected
export const getOrCreateHandler: AppRouteHandler<GetOrCreateRoute> = async (
  c,
) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid } = c.req.valid('param')
  const { path, prompt } = c.req.valid('json')

  const commitsScope = new CommitsRepository(workspace.id)

  const project = await findProjectById({ workspaceId: workspace.id, id: Number(projectId!) })
    .then((r) => r.unwrap())

  const commit = await commitsScope
    .getCommitByUuid({
      projectId: project.id,
      uuid: versionUuid!,
    })
    .then((r) => r.unwrap())

  const document = await getOrCreateDocument({
    workspace,
    commit,
    path,
    content: prompt,
  })

  const data = await documentPresenter({
    document,
    commit,
    workspace,
  })

  return c.json(data, 200)
}
