import { and, eq, getTableColumns, inArray, isNull } from 'drizzle-orm'
import Repository from './repositoryV2'
import { deploymentTests } from '../schema/models/deploymentTests'
import {
  ACTIVE_DEPLOYMENT_STATUSES,
  DeploymentTest,
  DeploymentTestStatus,
} from '../schema/models/types/DeploymentTest'
import { Result, type TypedResult } from '../lib/Result'
import { NotFoundError } from '@latitude-data/constants/errors'
import { CommitsRepository } from './commitsRepository'

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
   * Returns the test if the commit is either the baseline (head commit) or challenger in an active test
   */
  async findActiveForCommit(
    projectId: number,
    commitId: number,
  ): Promise<DeploymentTest | null> {
    // Get the head commit (baseline) for the project
    const commitsRepo = new CommitsRepository(this.workspaceId, this.db)
    const headCommit = await commitsRepo.getHeadCommit(projectId)
    const headCommitId = headCommit?.id

    // If commit is the head commit, it's the baseline for any active test
    if (headCommitId === commitId) {
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
        .limit(1)

      const test = result[0]
      if (test && ACTIVE_DEPLOYMENT_STATUSES.includes(test.status)) {
        return test
      }
      return null
    }

    // Otherwise, check if it's the challenger commit
    const result = await this.db
      .select()
      .from(deploymentTests)
      .where(
        and(
          eq(deploymentTests.projectId, projectId),
          eq(deploymentTests.workspaceId, this.workspaceId),
          isNull(deploymentTests.deletedAt),
          eq(deploymentTests.challengerCommitId, commitId),
        ),
      )
      .limit(1)

    const test = result[0]
    if (test && ACTIVE_DEPLOYMENT_STATUSES.includes(test.status)) {
      return test
    }
    return null
  }

  /**
   * Find all active deployment tests for a project
   * Returns tests with status 'pending', 'running', or 'paused'
   */
  async findAllActiveForProject(projectId: number): Promise<DeploymentTest[]> {
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

    return result.filter((test) =>
      ACTIVE_DEPLOYMENT_STATUSES.includes(test.status),
    )
  }

  /**
   * Filter deployment tests by project, commit, and status
   */
  async filterByProjectAndCommitAndStatus(
    projectId: number,
    commitId?: number,
    statuses?: string[],
  ): Promise<DeploymentTest[]> {
    const conditions = [
      eq(deploymentTests.projectId, projectId),
      this.scopeFilter,
    ]

    if (commitId) {
      conditions.push(eq(deploymentTests.challengerCommitId, commitId))
    }

    if (statuses && statuses.length > 0) {
      conditions.push(
        inArray(deploymentTests.status, statuses as DeploymentTestStatus[]),
      )
    }

    const result = await this.db
      .select()
      .from(deploymentTests)
      .where(and(...conditions))
      .orderBy(deploymentTests.createdAt)

    return result
  }
}
