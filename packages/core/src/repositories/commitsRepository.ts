import { HEAD_COMMIT } from '$core/constants'
import { NotFoundError, Result } from '$core/lib'
import { commits, Project, projects } from '$core/schema'
import { and, desc, eq, getTableColumns, isNotNull } from 'drizzle-orm'

import Repository from './repository'

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

  async getCommitMergedAt({
    project,
    uuid,
  }: {
    project: Project
    uuid: string
  }) {
    if (uuid === HEAD_COMMIT) {
      const result = await this.db
        .select({ mergedAt: this.scope.mergedAt })
        .from(this.scope)
        .where(
          and(
            eq(this.scope.projectId, project.id),
            isNotNull(this.scope.mergedAt),
          ),
        )
        .orderBy(desc(this.scope.mergedAt))
        .limit(1)

      if (!result.length) {
        return Result.error(new NotFoundError('No head commit found'))
      }
      const headCommit = result[0]!
      return Result.ok(headCommit.mergedAt!)
    }

    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.uuid, uuid))
    const commit = result[0]
    if (!commit) return Result.error(new NotFoundError('Commit not found'))

    return Result.ok(commit.mergedAt)
  }
}
