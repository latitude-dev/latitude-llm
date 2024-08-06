import {
  CommitsRepository,
  DocumentVersionsRepository,
  NotFoundError,
  ProjectsRepository,
  sanitizeDocumentPath,
} from '@latitude-data/core'
import type { Workspace } from '@latitude-data/core/browser'

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
  const documents = await docsScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  const document = documents.find(
    (d) => d.path === sanitizeDocumentPath(documentPath),
  )
  if (!document) throw new NotFoundError('Document not found')

  return { project, commit, document }
}
