import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '@latitude-data/core'
import type { Workspace } from '@latitude-data/core/browser'

const toDocumentPath = (path: string) => {
  if (path.startsWith('/')) {
    return path
  }

  return `/${path}`
}

export const getData = async ({
  workspace,
  projectId,
  commitUuid,
  documentPath,
}: {
  workspace: Workspace
  projectId: number
  commitUuid: string
  documentPath: string
}) => {
  const projectsScope = new ProjectsRepository(workspace.id)
  const commitsScope = new CommitsRepository(workspace.id)
  const docsScope = new DocumentVersionsRepository(workspace.id)

  const project = await projectsScope
    .getProjectById(projectId)
    .then((r) => r.unwrap())
  const commit = await commitsScope
    .getCommitByUuid({ project, uuid: commitUuid })
    .then((r) => r.unwrap())
  const document = await docsScope
    .getDocumentByPath({
      commit,
      path: toDocumentPath(documentPath),
    })
    .then((r) => r.unwrap())

  return { project, commit, document }
}
