import { and, eq, getTableColumns, isNull } from 'drizzle-orm'
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

  async findActiveForDocument(
    projectId: number,
    documentUuid: string,
  ): Promise<DeploymentTest | null> {
    const result = await this.db
      .select()
      .from(deploymentTests)
      .where(
        and(
          eq(deploymentTests.projectId, projectId),
          eq(deploymentTests.documentUuid, documentUuid),
          eq(deploymentTests.workspaceId, this.workspaceId),
          // Only get pending, running, or paused tests
          // Filter will be handled by the calling code
          isNull(deploymentTests.deletedAt),
        ),
      )
      .limit(1)

    // Filter to only active tests
    const test = result[0]
    if (test && ['pending', 'running', 'paused'].includes(test.status)) {
      return test
    }
    return null
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
}
