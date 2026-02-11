import { eq, getTableColumns } from 'drizzle-orm'

import { type Project } from '../schema/models/types/Project'
import { projects } from '../schema/models/projects'
import { projectsScope } from '../queries/projects/scope'
import { findProjectById } from '../queries/projects/findById'
import { findProjectByName } from '../queries/projects/findByName'
import { findProjectByDocumentUuid } from '../queries/projects/findByDocumentUuid'
import { findFirstProject } from '../queries/projects/findFirst'
import { findAllActiveProjects } from '../queries/projects/findAllActive'
import RepositoryLegacy from './repository'

const tt = getTableColumns(projects)

/** @deprecated Use query functions from `queries/projects/` instead */
export class ProjectsRepository extends RepositoryLegacy<typeof tt, Project> {
  get scope() {
    return this.db
      .select(tt)
      .from(projects)
      .where(eq(projects.workspaceId, this.workspaceId))
      .as('projectsScope')
  }

  private get _scope() {
    return projectsScope(this.workspaceId, this.db)
  }

  async getProjectById(id: number) {
    return findProjectById(this._scope, id)
  }

  async getProjectByName(name: string) {
    return findProjectByName(this._scope, name)
  }

  async getProjectByDocumentUuid(documentUuid: string) {
    return findProjectByDocumentUuid(this._scope, documentUuid)
  }

  async getFirstProject() {
    return findFirstProject(this._scope)
  }

  async findAllActive() {
    return findAllActiveProjects(this._scope)
  }
}
