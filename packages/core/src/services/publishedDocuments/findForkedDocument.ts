import { Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '../../repositories'

export async function findForkedDocument({
  workspace,
  projectId,
  commitUuid,
  documentUuid,
}: {
  workspace: Workspace
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  const repo = new ProjectsRepository(workspace.id)
  const resultProject = await repo.find(Number(projectId))

  if (resultProject.error) return resultProject

  const project = resultProject.value

  const commitsRepo = new CommitsRepository(workspace.id)
  const commitsResult = await commitsRepo.getCommitByUuid({
    projectId: project.id,
    uuid: commitUuid,
  })
  if (commitsResult.error) return commitsResult

  const documentsRepo = new DocumentVersionsRepository(workspace.id)
  const documentsResult = await documentsRepo.getDocumentAtCommit({
    projectId: project.id,
    commitUuid,
    documentUuid,
  })
  if (documentsResult.error) return documentsResult

  const commit = commitsResult.value
  const document = documentsResult.value

  return Result.ok({ project, commit, document })
}
