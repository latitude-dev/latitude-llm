import { desc, eq, getTableColumns, isNull, max, sql } from 'drizzle-orm'

import { Project } from '../browser'
import { NotFoundError, Result } from '../lib'
import { commits, documentVersions, projects } from '../schema'
import RepositoryLegacy from './repository'

const NOT_FOUND_MSG = 'Project not found'

const tt = getTableColumns(projects)

export class ProjectsRepository extends RepositoryLegacy<typeof tt, Project> {
  get scope() {
    return this.db
      .select(tt)
      .from(projects)
      .where(eq(projects.workspaceId, this.workspaceId))
      .as('projectsScope')
  }

  async getProjectById(id: number) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.id, id))
    const project = result[0]

    if (!project) {
      return Result.error(new NotFoundError(NOT_FOUND_MSG))
    }

    return Result.ok(project)
  }

  async getFirstProject() {
    const result = await this.db.select().from(this.scope).limit(1)
    const project = result[0]
    if (!project) return Result.error(new NotFoundError(NOT_FOUND_MSG))

    return Result.ok(project)
  }

  async findAllActive() {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(isNull(this.scope.deletedAt))

    return Result.ok(result)
  }

  async findAllActiveWithAgreggatedData() {
    const aggredatedData = this.db.$with('aggredatedData').as(
      this.db
        .select({
          id: this.scope.id,
          lastEditedAt: max(documentVersions.updatedAt).as('lastEditedAt'),
        })
        .from(this.scope)
        .innerJoin(commits, eq(commits.projectId, this.scope.id))
        .where(isNull(this.scope.deletedAt))
        .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
        .groupBy(this.scope.id),
    )

    const result = await this.db
      .with(aggredatedData)
      .select({
        ...this.scope._.selectedFields,
        lastEditedAt: aggredatedData.lastEditedAt,
      })
      .from(this.scope)
      .leftJoin(aggredatedData, eq(aggredatedData.id, this.scope.id))
      .where(isNull(this.scope.deletedAt))
      .orderBy(
        desc(
          sql`COALESCE(${aggredatedData.lastEditedAt}, ${this.scope.createdAt})`,
        ),
      )

    return Result.ok(result)
  }
}
