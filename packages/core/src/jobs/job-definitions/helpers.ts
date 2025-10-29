import { NotFoundError } from '@latitude-data/constants/errors'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { PromisedResult } from '../../lib/Transaction'
import { Commit } from '../../schema/models/types/Commit'
import { DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { Workspace } from '../../schema/models/types/Workspace'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
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
}): PromisedResult<{
  workspace: Workspace
  commit: Commit
  document: DocumentVersion
}> {
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

  return Result.ok({ workspace, commit, document })
}
