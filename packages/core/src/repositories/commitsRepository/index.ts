import { Project } from '$core/browser'
import { CommitStatus, HEAD_COMMIT } from '$core/constants'
import { NotFoundError, Result } from '$core/lib'
import { commits, projects } from '$core/schema'
import {
  and,
  desc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  or,
} from 'drizzle-orm'

import Repository, { PaginationArgs } from '../repository'

function filterByStatusQuery({
  scope,
  status,
}: {
  status: CommitStatus
  scope: typeof CommitsRepository.prototype.scope
}) {
  switch (status) {
    case CommitStatus.Draft:
      return isNull(scope.mergedAt)
    case CommitStatus.Merged:
      return isNotNull(scope.mergedAt)
    default:
      return or(isNotNull(scope.mergedAt), isNull(scope.mergedAt))
  }
}

export class CommitsRepository extends Repository {
  get scope() {
    return this.db
      .select(getTableColumns(commits))
      .from(commits)
      .innerJoin(projects, eq(projects.workspaceId, this.workspaceId))
      .where(eq(commits.projectId, projects.id))
      .as('commitsScope')
  }

  async getHeadCommit(project: Project) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(
        and(
          isNotNull(this.scope.mergedAt),
          eq(this.scope.projectId, project.id),
        ),
      )
      .orderBy(desc(this.scope.mergedAt))
      .limit(1)

    if (result.length < 1) {
      return Result.error(new NotFoundError('No head commit found'))
    }

    return Result.ok(result[0]!)
  }

  async getCommitByUuid({
    uuid,
    project,
  }: {
    project?: Project
    uuid: string
  }) {
    if (uuid === HEAD_COMMIT) {
      if (!project) {
        return Result.error(new NotFoundError('Project ID is required'))
      }

      return this.getHeadCommit(project)
    }

    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.uuid, uuid))
      .limit(1)
    const commit = result[0]
    if (!commit) return Result.error(new NotFoundError('Commit not found'))

    return Result.ok(commit)
  }

  async getCommitById(id: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, id))
      .limit(1)
    const commit = result[0]
    if (!commit) return Result.error(new NotFoundError('Commit not found'))

    return Result.ok(commit)
  }

  async getCommits() {
    return this.db.select().from(this.scope)
  }

  async getFirstCommitForProject(project: Project) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.projectId, project.id))
      .orderBy(this.scope.createdAt)
      .limit(1)

    if (result.length < 1) {
      return Result.error(new NotFoundError('No commits found'))
    }

    return Result.ok(result[0]!)
  }

  async getCommitsByProject({
    project,
    page = 1,
    filterByStatus = CommitStatus.All,
    pageSize = 20,
  }: { project: Project; filterByStatus?: CommitStatus } & PaginationArgs) {
    const filter = filterByStatusQuery({
      scope: this.scope,
      status: filterByStatus,
    })
    const query = this.db
      .select({
        id: this.scope.id,
        uuid: this.scope.uuid,
        title: this.scope.title,
        description: this.scope.description,
        projectId: this.scope.projectId,
        userId: this.scope.userId,
        mergedAt: this.scope.mergedAt,
        createdAt: this.scope.createdAt,
        updatedAt: this.scope.updatedAt,
      })
      .from(this.scope)
      .where(and(eq(this.scope.projectId, project.id), filter))

    const result = await Repository.paginateQuery({
      query: query.$dynamic(),
      page,
      pageSize,
    })
    return Result.ok(result)
  }
}
