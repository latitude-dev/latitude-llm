import { and, eq, getTableColumns, isNull, or } from 'drizzle-orm'
import Repository from './repositoryV2'
import { deploymentTests } from '../schema/models/deploymentTests'
import { DeploymentTest } from '../schema/models/types/DeploymentTest'
import { Result, type TypedResult } from '../lib/Result'
import { NotFoundError } from '@latitude-data/constants/errors'

const tt = getTableColumns(deploymentTests)

export class DeploymentTestsRepository extends Repository<DeploymentTest> {
  get scopeFilter() {
    return and(
      eq(deploymentTests.workspaceId, this.workspaceId),
      isNull(deploymentTests.deletedAt),
    )
  }

  get scope() {
    return this.db
      .select(tt)
      .from(deploymentTests)
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findByUuid(uuid: string): Promise<TypedResult<DeploymentTest>> {
    const result = await this.db
      .select()
      .from(deploymentTests)
      .where(
        and(
          eq(deploymentTests.uuid, uuid),
          eq(deploymentTests.workspaceId, this.workspaceId),
          isNull(deploymentTests.deletedAt),
        ),
      )
      .limit(1)

    if (!result[0]) {
      return Result.error(
        new NotFoundError(`Deployment test with uuid ${uuid} not found`),
      )
    }

    return Result.ok(result[0])
  }

  async listByProject(projectId: number): Promise<DeploymentTest[]> {
    const result = await this.db
      .select()
      .from(deploymentTests)
      .where(
        and(
          eq(deploymentTests.projectId, projectId),
          eq(deploymentTests.workspaceId, this.workspaceId),
          isNull(deploymentTests.deletedAt),
        ),
      )
      .orderBy(deploymentTests.createdAt)

    return result
  }

  /**
   * Find an active deployment test for a given commit
   * Returns the test if the commit is either the baseline or challenger in an active test
   */
  async findActiveForCommit(
    projectId: number,
    commitId: number,
  ): Promise<DeploymentTest | null> {
    const result = await this.db
      .select()
      .from(deploymentTests)
      .where(
        and(
          eq(deploymentTests.projectId, projectId),
          eq(deploymentTests.workspaceId, this.workspaceId),
          isNull(deploymentTests.deletedAt),
          // Check if the commit is either baseline or challenger
          or(
            eq(deploymentTests.baselineCommitId, commitId),
            eq(deploymentTests.challengerCommitId, commitId),
          ),
        ),
      )
      .limit(1)

    const test = result[0]
    if (test && ['pending', 'running', 'paused'].includes(test.status)) {
      return test
    }
    return null
  }
}
