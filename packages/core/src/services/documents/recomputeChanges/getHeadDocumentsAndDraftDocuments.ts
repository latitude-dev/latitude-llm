import { Commit } from '../../../browser'
import { database } from '../../../client'
import { Result } from '../../../lib/Result'
import { ProjectsRepository } from '../../../repositories'
import { buildCommitsScope } from '../../../repositories/commitsRepository/utils/buildCommitsScope'
import { getHeadCommitForProject } from '../../../repositories/commitsRepository/utils/getHeadCommit'
import { DocumentVersionsRepository } from '../../../repositories/documentVersionsRepository'

async function getProjectFromCommit(
  { commit, workspaceId }: { commit: Commit; workspaceId: number },
  tx = database,
) {
  const projectsScope = new ProjectsRepository(workspaceId, tx)
  const projectResult = await projectsScope.getProjectById(commit.projectId)

  if (!Result.isOk(projectResult)) return projectResult

  return Result.ok(projectResult.value)
}
async function getDraftDocuments(
  { commit, workspaceId }: { commit: Commit; workspaceId: number },
  tx = database,
) {
  const docsScope = new DocumentVersionsRepository(workspaceId, tx)
  const draftChangesResult = await docsScope.listCommitChanges(commit)
  if (!Result.isOk(draftChangesResult))
    return Result.error(draftChangesResult.error)
  return Result.ok(draftChangesResult.value)
}

async function getDocumentsAtCommit(
  { commit, workspaceId }: { commit: Commit; workspaceId: number },
  tx = database,
) {
  const projectResult = await getProjectFromCommit({ commit, workspaceId }, tx)
  if (!Result.isOk(projectResult)) return projectResult

  const commitsScope = buildCommitsScope(workspaceId, tx)
  const headCommit = await getHeadCommitForProject(
    { projectId: projectResult.value.id, commitsScope },
    tx,
  ).then((r) => r.unwrap())

  const docsScope = new DocumentVersionsRepository(workspaceId, tx)
  const headDocumentsResult = await docsScope.getDocumentsAtCommit(headCommit)
  if (!Result.isOk(headDocumentsResult))
    return Result.error(headDocumentsResult.error)

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
  if (!Result.isOk(headDocumentsResult)) return headDocumentsResult

  const headDocuments = headDocumentsResult.value

  const draftDocumentsResult = await getDraftDocuments(
    { commit, workspaceId },
    tx,
  )
  if (!Result.isOk(draftDocumentsResult)) return draftDocumentsResult

  return Result.ok({
    headDocuments,
    documentsInDrafCommit: draftDocumentsResult.value,
  })
}
