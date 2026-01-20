import { and, desc, eq, getTableColumns, isNull } from 'drizzle-orm'

import { type Project } from '../schema/models/types/Project'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { commits } from '../schema/models/commits'
import { documentVersions } from '../schema/models/documentVersions'
import { projects } from '../schema/models/projects'
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

  async getProjectByName(name: string) {
    const result = await this.db
      .select()
      .from(this.scope)
      .where(eq(this.scope.name, name))
    const project = result[0]

    if (!project) {
      return Result.error(new NotFoundError(NOT_FOUND_MSG))
    }

    return Result.ok(project)
  }

  async getProjectByDocumentUuid(documentUuid: string) {
    const results = await this.db
      .select(this.scope._.selectedFields)
      .from(this.scope)
      .innerJoin(commits, eq(commits.projectId, this.scope.id))
      .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
      .where(and(eq(documentVersions.documentUuid, documentUuid)))
      .limit(1)

    if (results.length === 0) {
      return Result.error(new NotFoundError(NOT_FOUND_MSG))
    }

    return Result.ok(results[0]!)
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
      .orderBy(desc(this.scope.lastEditedAt), desc(this.scope.id))

    return Result.ok(result)
  }
}
