import { type Commit } from '../schema/models/types/Commit'
import { BadRequestError } from './errors'
import { Result, TypedResult } from './Result'
import { DeploymentTestsRepository } from '../repositories'
import type { Database } from '../client'
import { findWorkspaceFromCommit } from '../data-access/workspaces'

export async function assertCommitNotInActiveAbTest(
  commit: Commit,
  db: Database,
): Promise<TypedResult<undefined, BadRequestError>> {
  const workspace = await findWorkspaceFromCommit(commit, db)

  if (!workspace) {
    // If we can't find workspace, allow the operation (shouldn't happen in practice)
    return Result.nil()
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
