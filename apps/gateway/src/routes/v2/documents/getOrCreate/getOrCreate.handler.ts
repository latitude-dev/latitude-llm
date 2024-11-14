import { Commit, Workspace } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { createNewDocument } from '@latitude-data/core/services/documents/create'
import { documentPresenter } from '$/presenters/documentPresenter'
import { AppRouteHandler } from '$/openApi/types'
import { GetOrCreateRoute } from '$/routes/v2/documents/getOrCreate/getOrCreate.route'

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

  const projectsScope = new ProjectsRepository(workspace.id)
  const commitsScope = new CommitsRepository(workspace.id)

  const project = await projectsScope
    .getProjectById(Number(projectId!))
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
