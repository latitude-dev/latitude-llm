import { unsafelyFindWorkspace } from '../../../../data-access/workspaces'
import { NotFoundError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '../../../../repositories'

export type GetDataParams = {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
}

export async function getDataForInitialRequest({
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
}: GetDataParams) {
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const projectsScope = new ProjectsRepository(workspaceId)
  const projectResult = await projectsScope.getProjectById(projectId)
  if (projectResult.error) return projectResult
  const project = projectResult.value

  const commitsScope = new CommitsRepository(workspaceId)
  const commitResult = await commitsScope.getCommitByUuid({
    projectId,
    uuid: commitUuid,
  })
  if (commitResult.error) return commitResult
  const commit = commitResult.value

  const documentsScope = new DocumentVersionsRepository(workspaceId)
  const documentResult = await documentsScope.getDocumentAtCommit({
    projectId,
    documentUuid,
    commitUuid,
  })
  if (documentResult.error) return documentResult
  const document = documentResult.value

  return Result.ok({ document, commit, project, workspace })
}
