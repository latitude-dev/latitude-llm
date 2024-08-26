import { Commit } from '$core/browser'
import { database } from '$core/client'
import { Result } from '$core/lib'
import { buildCommitsScope } from '$core/repositories/commitsRepository/utils/buildCommitsScope'
import { getHeadCommitForProject } from '$core/repositories/commitsRepository/utils/getHeadCommit'
import { DocumentVersionsRepository } from '$core/repositories/documentVersionsRepository'
import { ProjectsRepository } from '$core/repositories/projectsRepository'

async function getProjectFromCommit(
  { commit, workspaceId }: { commit: Commit; workspaceId: number },
  tx = database,
) {
  const projectsScope = new ProjectsRepository(workspaceId, tx)
  const projectResult = await projectsScope.getProjectById(commit.projectId)

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
  const headCommitResult = await getHeadCommitForProject(
    { project: projectResult.value, commitsScope },
    tx,
  )
  if (headCommitResult.error) return headCommitResult

  const headCommit = headCommitResult.value

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
