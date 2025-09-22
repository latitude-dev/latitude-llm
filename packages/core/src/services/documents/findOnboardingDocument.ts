import { database } from '../../client'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
  ProjectsRepository,
} from '../../repositories'

export const ONBOARDING_DOCUMENT_PATH = 'test'

export async function findOnboardingDocument(
  workspaceId: number,
  db = database,
) {
  try {
    // Get the first project in the workspace
    const projectsRepo = new ProjectsRepository(workspaceId, db)
    const projectResult = await projectsRepo.getFirstProject()
    if (projectResult.error) {
      return Result.error(projectResult.error)
    }
    const project = projectResult.value

    // Get the first commit in the project
    const commitsRepo = new CommitsRepository(workspaceId, db)
    const commitsResult = await commitsRepo.getFirstCommitForProject(project)
    if (commitsResult.error) {
      return Result.error(commitsResult.error)
    }
    const commit = commitsResult.unwrap()
    if (!commit) {
      return Result.error(new NotFoundError('No commit found'))
    }

    // Get the first document from the commit
    const docsRepo = new DocumentVersionsRepository(workspaceId, db)
    const docsResult = await docsRepo.getDocumentsAtCommit(commit)
    if (docsResult.error) {
      return Result.error(docsResult.error)
    }
    const documents = docsResult.unwrap()

    const document = documents.find((d) => d.path === ONBOARDING_DOCUMENT_PATH)
    if (!document) {
      return Result.error(
        new NotFoundError('No documents found in the first commit'),
      )
    }
    return Result.ok({ document, commit, project })
  } catch (error) {
    return Result.error(error as Error)
  }
}
