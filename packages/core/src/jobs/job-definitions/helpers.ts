import { NotFoundError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { findProjectById } from '../../queries/projects/findById'
import { Result } from '../../lib/Result'

export async function getJobDocumentData({
  workspaceId,
  projectId,
  commitUuid,
  documentUuid,
}: {
  workspaceId: number
  projectId: number
  commitUuid: string
  documentUuid: string
}) {
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const commitsScope = new CommitsRepository(workspaceId)
  const commitResult = await commitsScope.getCommitByUuid({
    projectId,
    uuid: commitUuid,
  })
  if (commitResult.error) return commitResult
  const commit = commitResult.unwrap()

  const documentScope = new DocumentVersionsRepository(workspaceId)
  const documentResult = await documentScope.getDocumentAtCommit({
    projectId,
    commitUuid,
    documentUuid,
  })
  if (documentResult.error) return documentResult
  const document = documentResult.unwrap()

  const project = await findProjectById({ workspaceId, id: projectId })
  if (!project) return Result.error(new NotFoundError('Project not found'))

  return Result.ok({ workspace, commit, document, project })
}
