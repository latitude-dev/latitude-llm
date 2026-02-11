import { database } from '../../client'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { findFirstProject } from '../../queries/projects/findFirst'

export async function findOnboardingDocument(
  workspaceId: number,
  db = database,
) {
  try {
    // Get the first project in the workspace
    const project = await findFirstProject({ workspaceId }, db)
    if (!project) {
      return Result.error(new NotFoundError('Project not found'))
    }

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

    return Result.ok({ documents, commit, project })
  } catch (error) {
    return Result.error(error as Error)
  }
}
