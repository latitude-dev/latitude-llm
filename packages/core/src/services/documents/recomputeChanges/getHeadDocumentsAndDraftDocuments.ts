import { type Commit } from '../../../schema/models/types/Commit'
import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import { findProjectById } from '../../../queries/projects/findById'
import { buildCommitsScope } from '../../../repositories/commitsRepository/utils/buildCommitsScope'
import { getHeadCommitForProject } from '../../../repositories/commitsRepository/utils/getHeadCommit'
import { DocumentVersionsRepository } from '../../../repositories/documentVersionsRepository'

async function getProjectFromCommit(
  { commit, workspaceId }: { commit: Commit; workspaceId: number },
  tx = database,
) {
  const projectResult = await findProjectById({ workspaceId, id: commit.projectId }, tx)

  if (projectResult.error) return projectResult

  return Result.ok(projectResult.value)
}
async function getDraftDocuments(
  { commit, workspaceId }: { commit: Commit; workspaceId: number },
  tx = database,
) {
  const docsScope = new DocumentVersionsRepository(workspaceId, tx)
  const draftChangesResult = await docsScope.listCommitChanges(commit)
  if (draftChangesResult.error) return Result.error(draftChangesResult.error)
  return Result.ok(draftChangesResult.value)
}

async function getDocumentsAtCommit(
  { commit, workspaceId }: { commit: Commit; workspaceId: number },
  tx = database,
) {
  const projectResult = await getProjectFromCommit({ commit, workspaceId }, tx)
  if (projectResult.error) return projectResult

  const commitsScope = buildCommitsScope(workspaceId, tx)
  const headCommit = await getHeadCommitForProject(
    { projectId: projectResult.value.id, commitsScope },
    tx,
  )

  const docsScope = new DocumentVersionsRepository(workspaceId, tx)
  const headDocumentsResult = await docsScope.getDocumentsAtCommit(headCommit)
  if (headDocumentsResult.error) return Result.error(headDocumentsResult.error)

  return Result.ok(headDocumentsResult.value)
}

export async function getHeadDocumentsAndDraftDocumentsForCommit(
  {
    commit,
    workspaceId,
  }: {
    commit: Commit
    workspaceId: number
  },
  tx = database,
) {
  const headDocumentsResult = await getDocumentsAtCommit(
    { commit, workspaceId },
    tx,
  )
  if (headDocumentsResult.error) return headDocumentsResult

  const headDocuments = headDocumentsResult.value

  const draftDocumentsResult = await getDraftDocuments(
    { commit, workspaceId },
    tx,
  )
  if (draftDocumentsResult.error) return draftDocumentsResult

  return Result.ok({
    headDocuments,
    documentsInDrafCommit: draftDocumentsResult.value,
  })
}
