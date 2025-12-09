import { type Commit } from '../schema/models/types/Commit'
import { BadRequestError } from './errors'
import { Result, TypedResult } from './Result'
import { DeploymentTestsRepository } from '../repositories'
import type { Database } from '../client'
import { findWorkspaceFromCommit } from '../data-access/workspaces'

/**
 * Asserts that a commit can be edited by checking:
 * 1. The commit is not merged (must be a draft)
 * 2. The commit is not part of an active A/B test
 */
export async function assertCanEditCommit(
  commit: Commit,
  db: Database,
): Promise<TypedResult<undefined, Error>> {
  // Check if commit is merged
  if (commit.mergedAt !== null) {
    return Result.error(new BadRequestError('Cannot modify a merged commit'))
  }

  // Check if commit is in an active A/B test
  const workspace = await findWorkspaceFromCommit(commit, db)
  if (!workspace) {
    return Result.error(new BadRequestError('Could not find workspace'))
  }

  const deploymentTestsRepo = new DeploymentTestsRepository(workspace.id, db)
  const activeTest = await deploymentTestsRepo.findActiveForCommit(
    commit.projectId,
    commit.id,
  )

  if (activeTest && activeTest.testType === 'ab') {
    return Result.error(
      new BadRequestError(
        'Cannot modify documents in a commit that is part of an active A/B test',
      ),
    )
  }

  return Result.nil()
}
