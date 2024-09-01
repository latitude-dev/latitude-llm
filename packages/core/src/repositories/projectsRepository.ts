import { eq, getTableColumns, isNull } from 'drizzle-orm'

import { NotFoundError, Result } from '../lib'
import { projects } from '../schema'
import Repository from './repository'

const NOT_FOUND_MSG = 'Project not found'

const tt = getTableColumns(projects)

export class ProjectsRepository extends Repository<typeof tt> {
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
}
