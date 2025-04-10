import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../../repositories'
import { unsafelyFindWorkspace } from '../../../../data-access'
import { NotFoundError } from './../../../../lib/errors'
import { Result } from './../../../../lib/Result'

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

  const documentsScope = new DocumentVersionsRepository(workspaceId)
  const commitsScope = new CommitsRepository(workspaceId)
  const documentResult = await documentsScope.getDocumentAtCommit({
    projectId,
    documentUuid,
    commitUuid,
  })

  if (documentResult.error) return documentResult

  const commitResult = await commitsScope.getCommitByUuid({
    projectId,
    uuid: commitUuid,
  })
  if (commitResult.error) return commitResult

  return Result.ok({
    workspace,
    document: documentResult.value,
    commit: commitResult.value,
  })
}
